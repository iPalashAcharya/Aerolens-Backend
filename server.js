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
const db = require('./db');
const JobProfileValidator = require('./validators/jobProfileValidator');
const AuthValidator = require('./validators/authValidator');
const tokenCleanup = require('./jobs/tokenCleanupJob');

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'https://d2xbx07vhovv1u.cloudfront.net/' // Add other ports if needed
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
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
    console.log("==== Incoming Request ====");
    console.log("URL:", req.originalUrl);
    console.log("Method:", req.method);
    console.log("Headers:", req.headers);

    if (req.is("application/json") || req.is("application/x-www-form-urlencoded")) {
        console.log("Body:", req.body);
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

app.use(globalErrorHandler);
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong'
    });
});
if (process.env.MODE === 'LOCAL') {
    app.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
    });
}