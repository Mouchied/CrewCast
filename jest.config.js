/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Collect coverage from business logic and utility modules
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Transform everything through jest-expo's transformer (handles Expo/RN modules)
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  // Test file locations
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/__tests__/**/*.spec.{ts,tsx}',
  ],
  // Verbose output so failures are easy to read in CI
  verbose: true,
  // Global setup: mock NativeAnimatedHelper so TouchableOpacity/Animated work in tests
  setupFilesAfterFramework: ['./jest.setup.js'],
  setupFiles: ['./jest.setup.js'],
};
