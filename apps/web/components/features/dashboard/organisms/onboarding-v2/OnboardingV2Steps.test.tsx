import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  createStepContext,
  SPARSE_SNAPSHOT,
} from './fixtures/onboardingV2StepContext';
import { OnboardingV2StepContent } from './OnboardingV2Steps';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, fill, unoptimized, ...rest } = props;
    return <img alt={typeof alt === 'string' ? alt : ''} {...rest} />;
  },
}));

function SearchHarness({ onInput }: { readonly onInput: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <OnboardingV2StepContent
      ctx={createStepContext({
        currentStep: 'spotify',
        handleArtistInput: next => {
          setValue(next);
          onInput(next);
        },
        searchInput: value,
      })}
    />
  );
}

describe('OnboardingV2StepContent', () => {
  it('keeps the typed Spotify search and picks an artist from the results', async () => {
    const user = userEvent.setup();
    const connectArtist = vi.fn();
    const onInput = vi.fn();
    const { container, rerender } = render(<SearchHarness onInput={onInput} />);

    const input = screen.getByRole('textbox', {
      name: 'Search By Artist Name Or Paste A Spotify Link',
    });
    expect(input).toHaveAttribute('data-host-drawn');
    await user.type(input, 'Avery');
    expect(input).toHaveValue('Avery');
    expect(onInput).toHaveBeenLastCalledWith('Avery');
    await expectNoA11yViolations(container);

    rerender(
      <OnboardingV2StepContent
        ctx={createStepContext({
          artistResults: [
            {
              followers: 1200,
              id: 'artist-1',
              name: 'Avery Stone',
              popularity: 40,
              url: 'https://open.spotify.com/artist/artist-1',
            },
          ],
          connectArtist,
          currentStep: 'spotify',
          searchInput: 'Avery',
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: /Avery Stone/ }));
    expect(connectArtist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'artist-1', name: 'Avery Stone' })
    );
  });

  it('offers the free and paid plan on the upgrade step', async () => {
    const user = userEvent.setup();
    const advanceFromStep = vi.fn();
    const navigateTo = vi.fn();
    render(
      <OnboardingV2StepContent
        ctx={createStepContext({
          advanceFromStep,
          currentStep: 'upgrade',
          discoverySnapshot: SPARSE_SNAPSHOT,
          navigateTo,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Continue Free' }));
    expect(advanceFromStep).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Upgrade Now' }));
    expect(navigateTo).toHaveBeenCalledWith(
      expect.stringContaining('/onboarding/checkout')
    );
  });

  it('keeps the optional note typed on the profile-ready step', async () => {
    const user = userEvent.setup();
    const handleCopyInstagramBioLink = vi.fn().mockResolvedValue(undefined);
    const setAnythingElse = vi.fn();
    const { container } = render(
      <OnboardingV2StepContent
        ctx={createStepContext({
          anythingElse: 'Hello',
          currentStep: 'profile-ready',
          discoverySnapshot: SPARSE_SNAPSHOT,
          handleCopyInstagramBioLink,
          setAnythingElse,
        })}
      />
    );

    const note = screen.getByRole('textbox', {
      name: 'Anything else I should know?',
    });
    expect(note).toHaveAttribute('data-host-drawn');
    expect(note).toHaveValue('Hello');
    await user.type(note, '!');
    expect(setAnythingElse).toHaveBeenCalledWith('Hello!');
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Copy Instagram Bio Link' })
    );
    expect(handleCopyInstagramBioLink).toHaveBeenCalledTimes(1);
  });
});
