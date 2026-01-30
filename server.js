require('dotenv').config();

console.log("MODE:", process.env.MODE);

if (process.env.MODE === 'LOCAL') {
    console.log('Running in LOCAL mode - using .env file');
} else {
    console.log('Running in NON-LOCAL mode:', process.env.MODE);
}

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const JobProfileRequirementValidator = require('./validators/jobProfileRequirementValidator');

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
        const jobProfileRequirementRoutes = require('./routes/jobProfileRequirementRoutes');
        const contactRoutes = require('./routes/contact');
        const candidateRoutes = require('./routes/candidateRoutes');
        const CandidateValidator = require('./validators/candidateValidator');
        const lookupRoutes = require('./routes/lookupRoutes');
        const memberRoutes = require('./routes/memberRoutes');
        const locationRoutes = require('./routes/locationRoutes');
        const interviewRoutes = require('./routes/interviewRoutes');
        const vendorRoutes = require('./routes/vendorRoutes');
        const db = require('./db');
        const JobProfileValidator = require('./validators/jobProfileValidator');
        const JobProfileRequirementValidator = require('./validators/jobProfileRequirementValidator');
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

        // Global rate limiter - VERY RELAXED for office environments
        const globalLimiter = rateLimit({
            windowMs: 1 * 60 * 1000,
            max: 500,
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => req.path === '/health'
        });

        // Login attempts - tracks by email in request body
        const loginLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 20, // 20 attempts per 15 minutes
            standardHeaders: true,
            legacyHeaders: false,
            skipSuccessfulRequests: true,
            handler: (req, res) => {
                const email = req.body.email || req.body.username || 'unknown';
                console.warn(`⚠️ Login rate limit hit for: ${email}`);
                res.status(429).json({
                    success: false,
                    error: 'LOGIN_ATTEMPTS_EXCEEDED',
                    message: 'Too many login attempts. Please try again in 15 minutes.'
                });
            }
        });

        // Strict limiter for registration/password reset
        const strictLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 10,
            standardHeaders: true,
            legacyHeaders: false
        });

        app.use(globalLimiter);

        // Only block truly malicious scanners
        app.use((req, res, next) => {
            if (req.path === '/health') return next();

            const userAgent = (req.get('user-agent') || '').toLowerCase();
            const malicious = ['masscan', 'nmap', 'nikto', 'sqlmap', 'metasploit', 'burpsuite'];

            if (malicious.some(bot => userAgent.includes(bot))) {
                console.warn(`🚫 BLOCKED malicious scanner: ${userAgent}`);
                return res.status(403).json({ success: false, error: 'FORBIDDEN' });
            }

            next();
        });

        // Simple burst protection - only for unauthenticated requests
        const burstTracker = new Map();

        app.use((req, res, next) => {
            if (req.path === '/health') return next();

            // Skip if authenticated
            if (req.headers.authorization?.startsWith('Bearer ')) {
                return next();
            }

            const ip = req.ip;
            const now = Date.now();

            if (!burstTracker.has(ip)) {
                burstTracker.set(ip, []);
            }

            const requests = burstTracker.get(ip);

            // Keep only requests from last 10 seconds
            const recentRequests = requests.filter(time => now - time < 10000);
            burstTracker.set(ip, recentRequests);

            // Allow 100 requests per 10 seconds (very generous)
            if (recentRequests.length > 100) {
                console.warn(`⚠️ Burst limit for ${ip}: ${recentRequests.length} requests/10s`);
                return res.status(429).json({
                    success: false,
                    error: 'TOO_MANY_REQUESTS',
                    message: 'Please slow down your requests'
                });
            }

            recentRequests.push(now);
            next();
        });

        // Cleanup every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [ip, requests] of burstTracker.entries()) {
                const recent = requests.filter(time => now - time < 10000);
                if (recent.length === 0) {
                    burstTracker.delete(ip);
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
        JobProfileRequirementValidator.init(db);
        CandidateValidator.init(db);
        MemberValidator.init(db);
        scheduledJobs.initializeAll();

        app.use('/auth/login', loginLimiter);
        app.use('/auth/register', strictLimiter);
        app.use('/auth/forgot-password', strictLimiter);
        app.use('/auth/change-password', strictLimiter);

        app.use('/auth', authRoutes);
        app.use('/client', clientRoutes);
        app.use('/department', departmentRoutes);
        app.use('/contact', contactRoutes);
        app.use('/jobProfile', jobProfileRoutes);
        app.use('/jobProfileRequirement', jobProfileRequirementRoutes);
        app.use('/candidate', candidateRoutes);
        app.use('/lookup', lookupRoutes);
        app.use('/member', memberRoutes);
        app.use('/location', locationRoutes);
        app.use('/interview', interviewRoutes);
        app.use('/vendor', vendorRoutes);

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
            console.log(`Server started successfully on port ${PORT}`);
            console.log(`Global rate limit: 500 requests/minute per IP`);
            console.log(`Burst protection: 100 requests/10 seconds (unauthenticated only)`);
            console.log(`Login limit: 20 attempts/15 minutes`);
            console.log(`Authenticated users bypass burst limits`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();