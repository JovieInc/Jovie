import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StarterEmptyState } from './StarterEmptyState';

describe('StarterEmptyState', () => {
  it('renders title, description, and data-testid', () => {
    render(
      <StarterEmptyState
        title='No data yet'
        description='Add your first item to get started.'
        testId='starter-empty'
      />
    );

    expect(screen.getByTestId('starter-empty')).toBeInTheDocument();
    expect(screen.getByText('No data yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add your first item to get started.')
    ).toBeInTheDocument();
  });

  it('handles primary and secondary actions', () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();

    render(
      <StarterEmptyState
        title='Missing content'
        description='Use the actions below.'
        primaryAction={{ label: 'Create', onClick: onPrimary }}
        secondaryAction={{ label: 'Learn more', onClick: onSecondary }}
      />
    );

    fireEvent.click(screen.getByText('Create'));
    fireEvent.click(screen.getByText('Learn more'));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
