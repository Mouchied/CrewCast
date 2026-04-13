/**
 * Unit tests for the Toast component and lib/toast.ts.
 *
 * Toast is a singleton driven by showToast(). Tests verify:
 * - Component renders nothing initially (no toast state).
 * - showToast() causes the message to appear.
 * - The lib/toast module correctly dispatches to the registered listener.
 *
 * Animated.timing is mocked so tests don't rely on timer behavior.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

// Mock Animated to avoid native driver warnings in the test environment
jest.mock('react-native/Libraries/Animated/Animated', () => {
  const ActualAnimated = jest.requireActual('react-native/Libraries/Animated/Animated');
  return {
    ...ActualAnimated,
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    sequence: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    delay: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  };
});

import { Toast } from '../../../components/Toast';
import { showToast } from '../../../lib/toast';

describe('Toast component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when no toast has been triggered', () => {
    const { toJSON } = render(<Toast />);
    // Before any showToast call the component returns null
    expect(toJSON()).toBeNull();
  });

  it('shows a success toast message after showToast is called', () => {
    const { getByText } = render(<Toast />);

    act(() => {
      showToast('success', 'Saved successfully!');
    });

    expect(getByText('Saved successfully!')).toBeTruthy();
  });

  it('shows an error toast message', () => {
    const { getByText } = render(<Toast />);

    act(() => {
      showToast('error', 'Something went wrong');
    });

    expect(getByText('Something went wrong')).toBeTruthy();
  });

  it('shows an info toast message', () => {
    const { getByText } = render(<Toast />);

    act(() => {
      showToast('info', 'Uploading…');
    });

    expect(getByText('Uploading…')).toBeTruthy();
  });

  it('replaces an existing toast with a new one', () => {
    const { getByText, queryByText } = render(<Toast />);

    act(() => {
      showToast('success', 'First message');
    });
    expect(getByText('First message')).toBeTruthy();

    act(() => {
      showToast('error', 'Second message');
    });
    expect(getByText('Second message')).toBeTruthy();
    expect(queryByText('First message')).toBeNull();
  });
});

describe('lib/toast showToast', () => {
  it('calls the registered listener with type and message', () => {
    const { _registerToastListener } = require('../../../lib/toast');
    const listener = jest.fn();
    _registerToastListener(listener);

    showToast('info', 'Hello listener');
    expect(listener).toHaveBeenCalledWith({ type: 'info', message: 'Hello listener' });
  });

  it('does nothing when no listener has been registered', () => {
    // Reset to no listener by registering a noop
    const { _registerToastListener } = require('../../../lib/toast');
    _registerToastListener(null as any);

    // Should not throw
    expect(() => showToast('success', 'no-op test')).not.toThrow();
  });
});
