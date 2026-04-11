/**
 * Jest config for RLS integration tests.
 *
 * These tests talk to a real Supabase instance and must run in a Node
 * environment. They are intentionally separate from the jest-expo unit
 * test config so that:
 *   • RN-specific transforms and mocks don't interfere
 *   • A missing TEST_SUPABASE_* env var causes tests to be skipped, not
 *     the whole unit-test suite to blow up
 *   • CI can run unit tests and integration tests independently
 *
 * Usage:
 *   TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... \
 *   TEST_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx jest --config jest.integration.config.js
 *
 * Or via the package.json shortcut:
 *   TEST_SUPABASE_URL=... npm run test:rls
 *
 * @type {import('jest').Config}
 */
module.exports = {
  // Use the project's Babel config (babel-preset-expo handles TypeScript).
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
  },
  // Pure Node — no jsdom, no React Native polyfills.
  testEnvironment: 'node',
  // Only pick up files in the rls and integration test directories.
  testMatch: [
    '<rootDir>/__tests__/rls/**/*.test.ts',
    '<rootDir>/__tests__/integration/**/*.test.ts',
  ],
  // Integration tests hit the network, so give them room.
  testTimeout: 30_000,
  verbose: true,
  // node_modules are pre-compiled; only transform source files.
  transformIgnorePatterns: ['node_modules/'],
};
