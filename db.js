const mysql = require('mysql2');
const env = require('dotenv');

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
        ca: Buffer.from(process.env.DB_CA_BASE64, 'base64').toString('utf-8')
    }
});

module.exports = pool.promise();