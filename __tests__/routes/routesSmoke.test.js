/**
 * Smoke-load route modules so top-level wiring (router + DI) is covered.
 * Excludes client.js (large geocoding surface).
 * Mocks BullMQ-backed queues so Redis is not contacted during require().
 */
jest.mock('../../queues/resumeBulkQueue', () => ({
    resumeBulkQueue: { close: jest.fn(), on: jest.fn(), add: jest.fn() },
}));

jest.mock('../../queues/whatsappQueue', () => ({
    whatsappResumeQueue: { close: jest.fn(), on: jest.fn() },
    enqueueWhatsAppResumeJob: jest.fn(),
}));

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        close: jest.fn(),
        on: jest.fn(),
    })),
}));

const routeModules = [
    '../../routes/authRoutes',
    '../../routes/candidateRoutes',
    '../../routes/contact',
    '../../routes/department',
    '../../routes/interviewRoutes',
    '../../routes/jobProfileRequirementRoutes',
    '../../routes/jobProfileRoutes',
    '../../routes/locationRoutes',
    '../../routes/lookupRoutes',
    '../../routes/memberRoutes',
    '../../routes/offerRoutes',
    '../../routes/vendorRoutes',
    '../../routes/whatsappRoutes',
    '../../routes/clientMVC',
];

describe('route modules load', () => {
    it('requires all route modules without throwing', () => {
        routeModules.forEach((modPath) => {
            jest.isolateModules(() => {
                const router = require(modPath);
                expect(typeof router.use).toBe('function');
            });
        });
    });
});
