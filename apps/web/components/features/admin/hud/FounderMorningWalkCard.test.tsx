import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { FounderMorningWalkCard } from './FounderMorningWalkCard';

vi.mock('@/lib/capture/record-screen', () => ({
  canRecordScreen: () => true,
  startScreenRecording: vi.fn(),
}));

vi.mock('@/lib/capture/upload-account-video', () => ({
  uploadAccountVideo: vi.fn(),
}));

describe('FounderMorningWalkCard', () => {
  it('renders the default status and the record control', () => {
    fastRender(<FounderMorningWalkCard defaultStatus='Walk logged today' />);

    expect(screen.getByText('Morning walk')).toBeInTheDocument();
    expect(screen.getByText('Walk logged today')).toBeInTheDocument();
    expect(screen.getByTestId('founder-morning-walk')).toBeInTheDocument();
    expect(screen.getByText('Record walk')).toBeInTheDocument();
  });

  it('renders signed-out defaults when no auth provider is present', () => {
    // Outside a JovieAuthValuesProvider the hook degrades to userId: null and
    // the card must still mount (upload paths fall back to 'unknown').
    fastRender(<FounderMorningWalkCard defaultStatus='Idle' />);

    expect(screen.getByTestId('founder-morning-walk')).toBeInTheDocument();
    expect(screen.queryByText('Stop')).toBeNull();
  });
});
