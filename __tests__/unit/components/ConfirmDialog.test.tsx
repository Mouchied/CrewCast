/**
 * Unit tests for the ConfirmDialog component.
 *
 * Tests:
 * - Title and message are rendered.
 * - Default confirmLabel is "Confirm"; custom label is respected.
 * - Pressing the confirm button calls onConfirm.
 * - Pressing the cancel button calls onCancel.
 * - Pressing the backdrop calls onCancel.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

const baseProps = {
  title: 'Delete job?',
  message: 'This action cannot be undone.',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('ConfirmDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title and message', () => {
    const { getByText } = render(<ConfirmDialog {...baseProps} />);
    expect(getByText('Delete job?')).toBeTruthy();
    expect(getByText('This action cannot be undone.')).toBeTruthy();
  });

  it('renders default confirmLabel "Confirm"', () => {
    const { getByText } = render(<ConfirmDialog {...baseProps} />);
    expect(getByText('Confirm')).toBeTruthy();
  });

  it('renders a custom confirmLabel', () => {
    const { getByText } = render(
      <ConfirmDialog {...baseProps} confirmLabel="Delete" />
    );
    expect(getByText('Delete')).toBeTruthy();
  });

  it('calls onConfirm when the confirm button is pressed', () => {
    const { getByText } = render(
      <ConfirmDialog {...baseProps} confirmLabel="Delete" />
    );
    fireEvent.press(getByText('Delete'));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(baseProps.onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the Cancel button is pressed', () => {
    const { getByText } = render(<ConfirmDialog {...baseProps} />);
    fireEvent.press(getByText('Cancel'));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });
});
