module.exports = {
    testEnvironment: 'node',
  
    collectCoverage: false,
  
    collectCoverageFrom: [
        "**/*.js",
        "!**/node_modules/**",
        "!**/__tests__/**",
        "!**/coverage/**",
        "!jest.config.js",
        "!server.js",
        "!appForTest.js",
        "!test-redis.js",
        "!**/scripts/**",
        "!**/routes/client.js"
      ],
  
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'lcov'],
  
    coverageThreshold: {
      global: {
        /* Branch % stays lower than line/statement % due to Joi validators, route wiring, and defensive branches. */
        branches: 65,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  
    maxWorkers: '50%',
    workerIdleMemoryLimit: '512MB',
    coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
    testTimeout: 10000,
  
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
  
    verbose: true,
    maxConcurrency: 5,
    forceExit: true,
  };