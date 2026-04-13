/**
 * Jest global setup — runs before every test file.
 *
 * Provides the NativeAnimatedModule mock required by TouchableOpacity,
 * Animated.timing, and Modal in the React Test Renderer environment.
 */

// Provide a minimal NativeAnimatedModule so TouchableOpacity / Animated
// components don't throw "Native animated module is not available".
jest.mock('react-native/src/private/animated/NativeAnimatedHelper', () => ({
  API: {
    setWaitingForIdentifier: jest.fn(),
    unsetWaitingForIdentifier: jest.fn(),
    createAnimatedNode: jest.fn(),
    startListeningToAnimatedNodeValue: jest.fn(),
    stopListeningToAnimatedNodeValue: jest.fn(),
    connectAnimatedNodes: jest.fn(),
    disconnectAnimatedNodes: jest.fn(),
    startAnimatingNode: jest.fn(),
    stopAnimation: jest.fn(),
    setAnimatedNodeValue: jest.fn(),
    setAnimatedNodeOffset: jest.fn(),
    flattenAnimatedNodeOffset: jest.fn(),
    extractAnimatedNodeOffset: jest.fn(),
    connectAnimatedNodeToView: jest.fn(),
    disconnectAnimatedNodeFromView: jest.fn(),
    restoreDefaultValues: jest.fn(),
    dropAnimatedNode: jest.fn(),
    addAnimatedEventToView: jest.fn(),
    removeAnimatedEventFromView: jest.fn(),
    flushQueue: jest.fn(),
    getValue: jest.fn((_tag, cb) => cb(0)),
  },
  addWhitelistedUIProps: jest.fn(),
  addWhitelistedTransformProps: jest.fn(),
  validateStyles: jest.fn(),
  validateTransform: jest.fn(),
  validateInterpolation: jest.fn(),
  generateNewNodeTag: jest.fn(() => Math.random()),
  generateNewAnimationId: jest.fn(() => Math.random()),
  assertNativeAnimatedModule: jest.fn(),
  shouldUseNativeDriver: jest.fn(() => false),
  transformDataType: jest.fn(x => x),
}));
