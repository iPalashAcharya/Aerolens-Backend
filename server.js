const express = require('express');
const cors = require('cors');
const clientRoutes = require('./routes/client');
const departmentRoutes = require('./routes/department');
const contactRoutes = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.removeHeader('Server');
    next();
});

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/client', clientRoutes);
app.use('/department', departmentRoutes);
app.use('/contact', contactRoutes);

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});