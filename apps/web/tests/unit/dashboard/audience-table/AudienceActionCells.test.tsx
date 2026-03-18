import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AudienceActionsCell,
  AudienceLastActionCell,
} from '@/components/organisms/table';
import type { AudienceAction } from '@/types';

describe('Audience action cells', () => {
  it('renders a safe fallback label when latest action label is missing', () => {
    render(
      <AudienceLastActionCell
        actions={[{ label: undefined } as unknown as AudienceAction]}
      />
    );

    expect(screen.getByText('Unknown action')).toBeInTheDocument();
  });

  it('renders action icons without crashing when action label is missing', () => {
    render(
      <AudienceActionsCell
        rowId='member-1'
        actions={[{ label: undefined } as unknown as AudienceAction]}
      />
    );

    expect(screen.getByTitle('Unknown action')).toBeInTheDocument();
  });
});
