const express = require('express');
const clientRoutes = require('./routes/client');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/client', clientRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});