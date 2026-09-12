import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import { InspectorRow } from './InspectorRow';

describe('InspectorRow', () => {
  it('renders a fact row with the 96px optical label column', () => {
    render(<InspectorRow label='ISRC' value='USRC17607839' />);

    expect(screen.getByText('ISRC')).toBeInTheDocument();
    expect(screen.getByText('USRC17607839')).toBeInTheDocument();
  });
});
