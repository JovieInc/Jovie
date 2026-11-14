import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProviderIcon } from './ProviderIcon';

describe('ProviderIcon', () => {
  it('names a known provider icon when labelled', async () => {
    const { container } = render(
      <ProviderIcon provider='spotify' aria-label='Spotify' />
    );

    expect(screen.getByLabelText('Spotify')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('h-5', 'w-5');
    expect(container.firstElementChild?.getAttribute('style')).toContain(
      'light-dark('
    );
    await expectNoA11yViolations(container);
  });

  it('hides a decorative icon from assistive technology', async () => {
    const { container } = render(
      <p>
        Listen on Spotify{' '}
        <ProviderIcon provider='spotify' className='h-4 w-4' />
      </p>
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('span')).toHaveClass('h-4', 'w-4');
    await expectNoA11yViolations(container);
  });

  it('falls back to a help icon for a provider it does not know', async () => {
    const { container } = render(
      <ProviderIcon
        provider={'unknown-provider' as ProviderKey}
        aria-label='Unknown provider'
      />
    );

    expect(screen.getByLabelText('Unknown provider')).toHaveClass(
      'lucide-circle-help'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a labelled provider row accessible in a right-to-left document', async () => {
    const providers: ProviderKey[] = ['spotify', 'apple_music', 'deezer'];
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <fieldset>
          <legend>منصات البث</legend>
          {providers.map(provider => (
            <ProviderIcon
              key={provider}
              provider={provider}
              aria-label={provider}
            />
          ))}
        </fieldset>
      </div>
    );

    for (const provider of providers)
      expect(screen.getByLabelText(provider)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
