/**
 * Unit tests for the Button component.
 *
 * Tests rendering across all variants, loading state (ActivityIndicator),
 * disabled state (not pressable), and press handler.
 */

import React from 'react';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../../components/Button';

describe('Button', () => {
  describe('label rendering', () => {
    it('renders the label text', () => {
      const { getByText } = render(<Button label="Save" onPress={() => {}} />);
      expect(getByText('Save')).toBeTruthy();
    });

    it('does not render label text when loading', () => {
      const { queryByText } = render(<Button label="Save" loading onPress={() => {}} />);
      expect(queryByText('Save')).toBeNull();
    });
  });

  describe('loading state', () => {
    it('renders ActivityIndicator when loading is true', () => {
      const { UNSAFE_getByType } = render(
        <Button label="Save" loading onPress={() => {}} />
      );
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it('does not render ActivityIndicator when not loading', () => {
      const { UNSAFE_queryAllByType } = render(
        <Button label="Save" onPress={() => {}} />
      );
      expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    });
  });

  describe('disabled state', () => {
    it('marks the touchable as disabled when disabled prop is true', () => {
      const { UNSAFE_getByType } = render(
        <Button label="Save" disabled onPress={() => {}} />
      );
      const touchable = UNSAFE_getByType(TouchableOpacity);
      expect(touchable.props.disabled).toBe(true);
    });

    it('marks the touchable as disabled when loading', () => {
      const { UNSAFE_getByType } = render(
        <Button label="Save" loading onPress={() => {}} />
      );
      const touchable = UNSAFE_getByType(TouchableOpacity);
      expect(touchable.props.disabled).toBe(true);
    });

    it('touchable is not disabled when neither disabled nor loading', () => {
      const { UNSAFE_getByType } = render(
        <Button label="Save" onPress={() => {}} />
      );
      const touchable = UNSAFE_getByType(TouchableOpacity);
      expect(touchable.props.disabled).toBeFalsy();
    });
  });

  describe('press handler', () => {
    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      const { getByText } = render(<Button label="Go" onPress={onPress} />);
      fireEvent.press(getByText('Go'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('variants', () => {
    it('renders primary variant by default without crashing', () => {
      expect(() =>
        render(<Button label="OK" onPress={() => {}} />)
      ).not.toThrow();
    });

    it('renders secondary variant', () => {
      const { getByText } = render(
        <Button label="Cancel" variant="secondary" onPress={() => {}} />
      );
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('renders destructive variant', () => {
      const { getByText } = render(
        <Button label="Delete" variant="destructive" onPress={() => {}} />
      );
      expect(getByText('Delete')).toBeTruthy();
    });
  });
});
