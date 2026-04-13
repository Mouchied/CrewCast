/**
 * Unit tests for the Input component.
 *
 * Tests label visibility, error text rendering, and text change event.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Input } from '../../../components/Input';

describe('Input', () => {
  describe('label', () => {
    it('renders label when provided', () => {
      const { getByText } = render(<Input label="Job name" />);
      expect(getByText('Job name')).toBeTruthy();
    });

    it('does not render label element when label is omitted', () => {
      const { queryByText } = render(<Input placeholder="Enter value" />);
      // No text nodes for a label — only the placeholder inside TextInput
      expect(queryByText('Enter value')).toBeNull(); // placeholder is not a Text node
    });
  });

  describe('error state', () => {
    it('shows error message when error prop is provided', () => {
      const { getByText } = render(<Input error="This field is required" />);
      expect(getByText('This field is required')).toBeTruthy();
    });

    it('does not show error text when error is omitted', () => {
      const { queryByText } = render(<Input label="Name" />);
      // No extra text nodes beyond the label
      expect(queryByText(/required/i)).toBeNull();
    });
  });

  describe('text input', () => {
    it('calls onChangeText when user types', () => {
      const onChangeText = jest.fn();
      const { getByDisplayValue, getByPlaceholderText } = render(
        <Input placeholder="Type here" onChangeText={onChangeText} />
      );
      const input = getByPlaceholderText('Type here');
      fireEvent.changeText(input, 'hello');
      expect(onChangeText).toHaveBeenCalledWith('hello');
    });

    it('reflects value prop', () => {
      const { getByDisplayValue } = render(
        <Input value="existing text" onChangeText={() => {}} />
      );
      expect(getByDisplayValue('existing text')).toBeTruthy();
    });
  });
});
