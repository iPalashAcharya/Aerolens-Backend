const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
        send: mockSend,
    })),
    GetSecretValueCommand: jest.fn().mockImplementation((input) => input),
}));

describe('config/secrets fetchSecrets', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('returns early in LOCAL mode without calling AWS', async () => {
        process.env.MODE = 'LOCAL';
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const fetchSecrets = require('../../config/secrets');
        await fetchSecrets();

        expect(mockSend).not.toHaveBeenCalled();
        console.log.mockRestore();
    });

    it('returns when SECRET_NAME is missing', async () => {
        delete process.env.MODE;
        delete process.env.SECRET_NAME;
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const fetchSecrets = require('../../config/secrets');
        await fetchSecrets();

        expect(mockSend).not.toHaveBeenCalled();
        console.log.mockRestore();
    });

    it('parses SecretString JSON and assigns keys to process.env', async () => {
        delete process.env.MODE;
        process.env.SECRET_NAME = 'mysecret';
        process.env.AWS_REGION = 'ap-south-1';
        process.env.FROM_SECRET = 'before';

        mockSend.mockResolvedValue({
            SecretString: JSON.stringify({ FROM_SECRET: 'after', OTHER: 'x' }),
        });
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const fetchSecrets = require('../../config/secrets');
        await fetchSecrets();

        expect(process.env.FROM_SECRET).toBe('after');
        expect(process.env.OTHER).toBe('x');
        console.log.mockRestore();
    });

    it('parses SecretBinary when SecretString is absent', async () => {
        jest.resetModules();
        process.env = { ...originalEnv, SECRET_NAME: 'bin', AWS_REGION: 'ap-south-1' };
        delete process.env.MODE;

        const payload = Buffer.from(JSON.stringify({ BIN_KEY: 'y' }), 'utf8').toString('base64');
        mockSend.mockResolvedValue({
            SecretString: null,
            SecretBinary: payload,
        });
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const fetchSecrets = require('../../config/secrets');
        await fetchSecrets();

        expect(process.env.BIN_KEY).toBe('y');
        console.log.mockRestore();
    });
});
