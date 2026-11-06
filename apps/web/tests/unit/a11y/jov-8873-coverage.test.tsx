import { Button, SegmentControl } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// JOV-8873: the covering tests for these changed source lines were moved out
// of button.test.tsx / segment-control.test.tsx to get back under the
// merge-base size pins (JOV-8873 shrink). This file restores that coverage
// additively in a fresh, unbaselined file.
const options = [
  { value: 'links', label: 'Links' },
  { value: 'music', label: 'Music' },
] as const;

describe('JOV-8873 shrunk-coverage restore', () => {
  it('renders destructive secondary buttons with the AA error text token', () => {
    render(
      <Button variant='secondary' destructive>
        Delete
      </Button>
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
      'text-error-text'
    );
  });

  it('keeps the linear-pill active trigger transparent for the indicator', () => {
    render(
      <SegmentControl
        value='links'
        variant='linear-pill'
        onValueChange={vi.fn()}
        options={[...options]}
      />
    );
    expect(
      screen.getByRole('tab', { name: 'Links', selected: true })
    ).toHaveClass('data-[state=active]:bg-transparent');
  });
});
