const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const globalErrorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/appError');
const rateLimit = require('express-rate-limit');
const clientRoutes = require('./routes/clientMVC');
const departmentRoutes = require('./routes/department');
const jobProfileRoutes = require('./routes/jobProfileRoutes');
const contactRoutes = require('./routes/contact');
const candidateRoutes = require('./routes/candidateRoutes');
const CandidateValidator = require('./validators/candidateValidator');
const lookupRoutes = require('./routes/lookupRoutes');
const db = require('./db');
const JobProfileValidator = require('./validators/jobProfileValidator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());

app.set('trust proxy', 1);
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 100 requests per windowMs
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

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});