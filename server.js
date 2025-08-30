const express = require('express');
const clientRoutes = require('./routes/client');

const app = express();
const PORT = process.env.PORT || 3000;;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/client', clientRoutes);

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});