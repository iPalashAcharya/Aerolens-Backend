const express = require('express');
const cors = require('cors');
const clientRoutes = require('./routes/client');

const app = express();
const PORT = process.env.PORT || 3000;;


app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/client', clientRoutes);

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});