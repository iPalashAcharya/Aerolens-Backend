describe('config/whatsapp', () => {
    const originalEnv = process.env;

    afterEach(() => {
        process.env = originalEnv;
        jest.resetModules();
    });

    it('exports apiBaseUrl using WA_GRAPH_VERSION default', () => {
        process.env = { ...originalEnv };
        delete process.env.WA_GRAPH_VERSION;
        jest.resetModules();

        const wa = require('../../config/whatsapp');

        expect(wa.apiBaseUrl).toBe('https://graph.facebook.com/v20.0');
    });

    it('exports apiBaseUrl with custom WA_GRAPH_VERSION', () => {
        process.env = { ...originalEnv, WA_GRAPH_VERSION: 'v21.0' };
        jest.resetModules();

        const wa = require('../../config/whatsapp');

        expect(wa.apiBaseUrl).toBe('https://graph.facebook.com/v21.0');
    });
});
