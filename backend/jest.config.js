module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': '<rootDir>/jest.ts-transformer.js',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
