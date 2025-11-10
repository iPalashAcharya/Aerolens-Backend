const mysql = require('mysql2');
const env = require('dotenv');
const fs = require('fs');
const path = require('path');

env.config();

let sslConfig;
if (process.env.NODE_ENV === 'development') {
    sslConfig = {
        ca: Buffer.from(process.env.DB_CA_BASE64, 'base64').toString('utf-8')
    }
} else {
    sslConfig = {
        ca: fs.readFileSync(path.join(__dirname, 'certs', 'rds_ca.pem'))
    }
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: sslConfig
});

module.exports = pool.promise();