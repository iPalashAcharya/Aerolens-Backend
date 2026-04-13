/**
 * Ensures db module can load in non-development NODE_ENV (uses fs SSL path).
 */
describe('db.js pool', () => {
    const ORIG_ENV = process.env.NODE_ENV;

    afterEach(() => {
        process.env.NODE_ENV = ORIG_ENV;
        jest.resetModules();
        jest.dontMock('fs');
        jest.dontMock('mysql2');
    });

    it('creates pool when NODE_ENV is test (non-development ssl branch)', () => {
        jest.resetModules();
        jest.doMock('fs', () => ({
            readFileSync: jest.fn(() => 'mock-ca-pem'),
        }));
        jest.doMock('mysql2', () => ({
            createPool: jest.fn(() => ({
                promise: () => ({ query: jest.fn() }),
            })),
        }));

        process.env.NODE_ENV = 'test';
        process.env.DB_HOST = 'localhost';
        process.env.DB_PORT = '3306';
        process.env.DB_USER = 'u';
        process.env.DB_PASSWORD = 'p';
        process.env.DB_DATABASE = 'd';

        const pool = require('../db');
        expect(pool).toBeDefined();

        const mysql = require('mysql2');
        expect(mysql.createPool).toHaveBeenCalled();
    });
});
