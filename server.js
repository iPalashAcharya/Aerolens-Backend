// For local development only - load .env file if MODE is LOCAL
if (process.env.MODE === 'LOCAL') {
    require('dotenv').config();
    console.log('Running in LOCAL mode - using .env file');
}

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

/**
 * Fetch secrets from AWS Secrets Manager
 */
async function fetchSecrets() {
    // Skip AWS Secrets Manager in local mode
    if (process.env.MODE === 'LOCAL') {
        console.log('✓ Skipping AWS Secrets Manager (LOCAL mode)');
        return;
    }

    try {
        console.log('Fetching secrets from AWS Secrets Manager...');

        // You only need to set these two via environment variables
        const secretName = process.env.SECRET_NAME || '/myapp/prod/env';
        const region = process.env.AWS_REGION || 'ap-south-1';

        if (!secretName || !region) {
            throw new Error('SECRET_NAME and AWS_REGION must be set');
        }

        // Configure AWS SDK - it will automatically use the EC2 IAM role
        const client = new SecretsManagerClient({ region });

        const response = await client.send(
            new GetSecretValueCommand({ SecretId: secretName })
        );

        let secrets;
        if (response.SecretString) {
            secrets = JSON.parse(response.SecretString);
        } else {
            // Handle binary secret if needed
            const buff = Buffer.from(response.SecretBinary, 'base64');
            secrets = JSON.parse(buff.toString('ascii'));
        }

        // Set secrets as environment variables
        Object.keys(secrets).forEach(key => {
            process.env[key] = secrets[key];
        });

        console.log('✓ Secrets loaded successfully');
        return secrets;

    } catch (error) {
        console.error('✗ Error fetching secrets from AWS Secrets Manager:', error.message);

        // Check for common errors
        if (error.name === 'ResourceNotFoundException') {
            console.error('The requested secret was not found');
        } else if (error.name === 'InvalidRequestException') {
            console.error('The request was invalid');
        } else if (error.name === 'InvalidParameterException') {
            console.error('The request had invalid params');
        } else if (error.name === 'AccessDeniedException') {
            console.error('Access denied - check IAM role permissions');
        }

        // Exit the process if secrets cannot be loaded
        console.error('Cannot start server without secrets. Exiting...');
        process.exit(1);
    }
}

/**
 * Initialize and start the Express server
 */
async function startServer() {
    try {
        // Fetch secrets BEFORE importing any modules that need them
        await fetchSecrets();

        // Now import the rest of the modules (they can use process.env values)
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
        const tokenCleanup = require('./jobs/tokenCleanupJob');

        const app = express();
        const PORT = process.env.PORT || 3000;
        const allowedOrigins = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:3000',
            process.env.FRONTEND_URL
        ];

        app.use(cors({
            origin: function (origin, callback) {
                // Allow requests with no origin (like Postman or mobile apps)
                if (!origin) return callback(null, true);

                // Check if the origin is in the allowed list
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
        app.use(helmet());
        app.use(compression());

        app.set('trust proxy', 1);

        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 500,
            message: {
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests from this IP, please try again later.'
            }
        });
        app.use(limiter);

        app.disable('x-powered-by');
        app.use((req, res, next) => {
            res.removeHeader('Server');
            next();
        });

        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(cookieParser());

        app.use(passport.initialize());

        app.use((req, res, next) => {
            if (req.originalUrl === '/health') {
                return next();
            }
            console.log("==== Incoming Request ====");
            console.log("URL:", req.originalUrl);
            console.log("Method:", req.method);
            console.log("Headers:", req.headers);

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
        tokenCleanup.initializeAll();
        app.use('/auth', authRoutes);
        app.use('/client', clientRoutes);
        app.use('/department', departmentRoutes);
        app.use('/contact', contactRoutes);
        JobProfileValidator.init(db);
        app.use('/jobProfile', jobProfileRoutes);
        CandidateValidator.init(db);
        app.use('/candidate', candidateRoutes);
        app.use('/lookup', lookupRoutes);
        MemberValidator.init(db);
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

        if (process.env.MODE === 'LOCAL') {
            app.listen(PORT, () => {
                console.log(`✓ Server started successfully on port ${PORT}`);
            });
        } else {
            app.listen(PORT, () => {
                console.log(`✓ Server started successfully on port ${PORT}`);
            });
        }

    } catch (error) {
        console.error('✗ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();