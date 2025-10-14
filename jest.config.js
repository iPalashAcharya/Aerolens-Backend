module.exports = {
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'lcov'],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    maxWorkers: '50%', // Use only 50% of available CPUs
    workerIdleMemoryLimit: '512MB',
    coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
    testTimeout: 10000,
    detectLeaks: false, // Can enable for debugging but slows tests
    detectOpenHandles: false,

    // Clear mocks between tests
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,

    // Verbose output
    verbose: true,

    // Bail on first failure (optional, faster feedback)
    // bail: 1,

    // Run tests serially (slower but prevents memory issues)
    maxConcurrency: 5,
    forceExit: true,
};