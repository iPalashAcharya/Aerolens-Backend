const mysql = require('mysql2');
const env = require('dotenv');
const fs = require('fs');
const path = require('path');

env.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        ca: fs.readFileSync(path.join(__dirname, 'certs', 'rds_ca.pem'))
    }
});

module.exports = pool.promise();