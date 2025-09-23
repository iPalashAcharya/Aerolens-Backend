import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Import middleware and utilities
// Note: These will need to be migrated gradually - keeping require() for now
const globalErrorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/appError');

// Import routes - keeping require() during gradual migration
const clientRoutes = require('./routes/clientMVC');
const departmentRoutes = require('./routes/department');
const jobProfileRoutes = require('./routes/jobProfileRoutes');
const contactRoutes = require('./routes/contact');
const candidateRoutes = require('./routes/candidateRoutes');

// Import validators - keeping require() during gradual migration
const CandidateValidator = require('./validators/candidateValidator');
const JobProfileValidator = require('./validators/jobProfileValidator');

// Import database - keeping require() during gradual migration
const db = require('./db');

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 500 requests per windowMs
    message: {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.'
    }
});

app.use(limiter);

// Disable x-powered-by header
app.disable('x-powered-by');

// Remove Server header middleware
app.use((req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('Server');
    next();
});

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/client', clientRoutes);
app.use('/department', departmentRoutes);
app.use('/contact', contactRoutes);

// Initialize validators
JobProfileValidator.init(db);
app.use('/jobProfile', jobProfileRoutes);

CandidateValidator.init(db);
app.use('/candidate', candidateRoutes);

// Global error handler
app.use(globalErrorHandler);

// Final error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong'
    });
});

// Start server
app.listen(PORT, (): void => {
    console.log(`Server started on port ${PORT}`);
});

export default app;