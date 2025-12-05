require('dotenv').config();

console.log("MODE:", process.env.MODE);

if (process.env.MODE === 'LOCAL') {
    console.log('Running in LOCAL mode - using .env file');
} else {
    console.log('Running in NON-LOCAL mode:', process.env.MODE);
}

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function fetchSecrets() {
    if (process.env.MODE === 'LOCAL') {
        console.log('✓ Skipping AWS Secrets Manager (LOCAL mode)');
        return;
    }

    try {
        console.log('Fetching secrets from AWS Secrets Manager...');

        const secretName = process.env.SECRET_NAME || '/myapp/prod/env';
        const region = process.env.AWS_REGION || 'ap-south-1';

        if (!secretName || !region) {
            throw new Error('SECRET_NAME and AWS_REGION must be set');
        }

        const client = new SecretsManagerClient({ region });

        const response = await client.send(
            new GetSecretValueCommand({ SecretId: secretName })
        );

        let secrets;
        if (response.SecretString) {
            secrets = JSON.parse(response.SecretString);
        } else {
            const buff = Buffer.from(response.SecretBinary, 'base64');
            secrets = JSON.parse(buff.toString('ascii'));
        }

        Object.keys(secrets).forEach(key => {
            process.env[key] = secrets[key];
        });

        console.log('✓ Secrets loaded successfully');
        return secrets;

    } catch (error) {
        console.error('✗ Error fetching secrets from AWS Secrets Manager:', error.message);

        if (error.name === 'ResourceNotFoundException') {
            console.error('The requested secret was not found');
        } else if (error.name === 'InvalidRequestException') {
            console.error('The request was invalid');
        } else if (error.name === 'InvalidParameterException') {
            console.error('The request had invalid params');
        } else if (error.name === 'AccessDeniedException') {
            console.error('Access denied - check IAM role permissions');
        }

        console.error('Cannot start server without secrets. Exiting...');
        process.exit(1);
    }
}

async function startServer() {
    try {
        await fetchSecrets();

        const express = require('express');
        const cookieParser = require('cookie-parser');
        const passport = require('./config/passport');
        const cors = require('cors');
        const helmet = require('helmet');
        const compression = require('compression');
        const globalErrorHandler = require('./middleware/errorHandler');
        const rateLimit = require('express-rate-limit');
        const authRoutes = require('./routes/authRoutes');
        const clientRoutes = require('./routes/clientMVC');
        const departmentRoutes = require('./routes/department');
        const jobProfileRoutes = require('./routes/jobProfileRoutes');
        const contactRoutes = require('./routes/contact');
        const candidateRoutes = require('./routes/candidateRoutes');
        const CandidateValidator = require('./validators/candidateValidator');
        const lookupRoutes = require('./routes/lookupRoutes');
        const memberRoutes = require('./routes/memberRoutes');
        const locationRoutes = require('./routes/locationRoutes');
        const interviewRoutes = require('./routes/interviewRoutes');
        const db = require('./db');
        const JobProfileValidator = require('./validators/jobProfileValidator');
        const AuthValidator = require('./validators/authValidator');
        const MemberValidator = require('./validators/memberValidator');
        const scheduledJobs = require('./jobs/scheduledJobs');

        const app = express();
        const PORT = process.env.PORT || 3000;
        const allowedOrigins = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:3000',
            process.env.FRONTEND_URL
        ];

        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        app.use(cors({
            origin: function (origin, callback) {
                if (!origin) return callback(null, true);
                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }));

        app.use(compression());
        app.set('trust proxy', 1);


        const globalLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 50, // 50 requests per minute
            message: {
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests. Please slow down.'
            },
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => req.path === '/health'
        });

        const strictLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 10, // 10 requests per 15 minutes
            message: {
                success: false,
                error: 'TOO_MANY_ATTEMPTS',
                message: 'Too many attempts. Please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false
        });

        const loginLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 login attempts per 15 minutes
            message: {
                success: false,
                error: 'LOGIN_ATTEMPTS_EXCEEDED',
                message: 'Too many login attempts. Please try again in 15 minutes.'
            },
            standardHeaders: true,
            legacyHeaders: false,
            skipSuccessfulRequests: true
        });

        app.use(globalLimiter);

        // Block suspicious user agents (common bot signatures)
        app.use((req, res, next) => {
            const userAgent = req.get('user-agent') || '';
            const suspiciousAgents = [
                'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
                'python-requests', 'axios', 'go-http-client', 'java'
            ];

            if (req.path === '/health') {
                return next();
            }

            const isSuspicious = suspiciousAgents.some(agent =>
                userAgent.toLowerCase().includes(agent)
            );

            if (isSuspicious && !userAgent) {
                console.warn(`⚠️ Blocked suspicious request from ${req.ip}: No user agent`);
                return res.status(403).json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: 'Access denied'
                });
            }

            if (isSuspicious) {
                console.warn(`⚠️ Suspicious user agent from ${req.ip}: ${userAgent}`);
                // Optionally block or just log
                // return res.status(403).json({ success: false, error: 'FORBIDDEN' });
            }

            next();
        });

        const requestTracker = new Map();
        const RAPID_FIRE_THRESHOLD = 10; // requests
        const RAPID_FIRE_WINDOW = 5000; // 5 seconds
        const BLOCK_DURATION = 60000; // 1 minute

        app.use((req, res, next) => {
            if (req.path === '/health') return next();

            const ip = req.ip;
            const now = Date.now();

            if (!requestTracker.has(ip)) {
                requestTracker.set(ip, {
                    requests: [],
                    blocked: false,
                    blockedUntil: 0
                });
            }

            const tracker = requestTracker.get(ip);

            if (tracker.blocked && now < tracker.blockedUntil) {
                console.warn(`🚫 Blocked IP ${ip} attempting access`);
                return res.status(429).json({
                    success: false,
                    error: 'BLOCKED',
                    message: 'Your IP has been temporarily blocked due to suspicious activity'
                });
            }

            if (tracker.blocked && now >= tracker.blockedUntil) {
                tracker.blocked = false;
                tracker.requests = [];
            }

            tracker.requests.push(now);

            tracker.requests = tracker.requests.filter(time =>
                now - time < RAPID_FIRE_WINDOW
            );

            if (tracker.requests.length > RAPID_FIRE_THRESHOLD) {
                tracker.blocked = true;
                tracker.blockedUntil = now + BLOCK_DURATION;
                console.error(`IP ${ip} BLOCKED: ${tracker.requests.length} requests in ${RAPID_FIRE_WINDOW / 1000}s`);

                return res.status(429).json({
                    success: false,
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests. Your IP has been temporarily blocked.'
                });
            }

            next();
        });

        setInterval(() => {
            const now = Date.now();
            for (const [ip, tracker] of requestTracker.entries()) {
                if (!tracker.blocked && tracker.requests.length === 0) {
                    requestTracker.delete(ip);
                } else if (tracker.blocked && now >= tracker.blockedUntil) {
                    requestTracker.delete(ip);
                }
            }
        }, 5 * 60 * 1000);


        app.disable('x-powered-by');
        app.use((req, res, next) => {
            res.removeHeader('Server');
            next();
        });

        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        app.use(cookieParser());

        app.use(passport.initialize());

        app.use((req, res, next) => {
            if (req.originalUrl === '/health') {
                return next();
            }
            console.log("==== Incoming Request ====");
            console.log("URL:", req.originalUrl);
            console.log("Method:", req.method);
            console.log("IP:", req.ip);
            console.log("User-Agent:", req.get('user-agent'));

            if (!req.originalUrl.startsWith('/auth/')) {
                if (req.is("application/json") || req.is("application/x-www-form-urlencoded")) {
                    console.log("Body:", req.body);
                }
            }

            if (req.is("multipart/form-data")) {
                console.log("Multipart form detected");
            }
            console.log("==========================");
            next();
        });

        AuthValidator.init(db);
        JobProfileValidator.init(db);
        CandidateValidator.init(db);
        MemberValidator.init(db);
        scheduledJobs.initializeAll();

        app.use('/auth/login', loginLimiter);
        app.use('/auth/register', strictLimiter);
        app.use('/auth/forgot-password', strictLimiter);
        app.use('/auth/reset-password', strictLimiter);

        app.use('/auth', authRoutes);
        app.use('/client', clientRoutes);
        app.use('/department', departmentRoutes);
        app.use('/contact', contactRoutes);
        app.use('/jobProfile', jobProfileRoutes);
        app.use('/candidate', candidateRoutes);
        app.use('/lookup', lookupRoutes);
        app.use('/member', memberRoutes);
        app.use('/location', locationRoutes);
        app.use('/interview', interviewRoutes);

        app.use(globalErrorHandler);
        app.use((err, req, res, next) => {
            console.error('Error:', err);
            res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Something went wrong'
            });
        });

        app.get('/health', (req, res) => {
            res.status(200).send('OK');
        });

        app.listen(PORT, () => {
            console.log(`✓ Server started successfully`);
            console.log(`✓ Global rate limit: 50 requests/minute per IP`);
            console.log(`✓ Rapid-fire protection: ${RAPID_FIRE_THRESHOLD} requests/${RAPID_FIRE_WINDOW / 1000}s`);
            console.log(`✓ Auth endpoints: 5-10 attempts/15min`);
        });

    } catch (error) {
        console.error('✗ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();