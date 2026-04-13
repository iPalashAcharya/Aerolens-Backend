describe('webhookRoutes', () => {
    it('exports an Express router', () => {
        const router = require('../../routes/webhookRoutes');

        expect(router).toBeDefined();
        expect(typeof router.get).toBe('function');
        expect(typeof router.post).toBe('function');
    });
});
