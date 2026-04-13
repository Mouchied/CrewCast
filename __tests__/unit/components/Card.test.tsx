/**
 * Unit tests for the Card component.
 *
 * Card is a simple container. Tests verify children are rendered
 * and that style overrides are accepted without error.
 */

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Card } from '../../../components/Card';

describe('Card', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Card>
        <Text>Hello from card</Text>
      </Card>
    );
    expect(getByText('Hello from card')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <Card>
        <Text>First</Text>
        <Text>Second</Text>
      </Card>
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });

  it('accepts a custom style prop without crashing', () => {
    expect(() =>
      render(
        <Card style={{ margin: 8 }}>
          <Text>Styled</Text>
        </Card>
      )
    ).not.toThrow();
  });
});
