import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdditionalLinkRow, PrimaryDspRow } from './ListenNowForm.parts';

describe('PrimaryDspRow', () => {
  it('reports typing and blur, offers Search, axe-clean', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const onSearch = vi.fn();
    const { container } = render(
      <PrimaryDspRow
        platformId='spotify'
        icon='spotify'
        label='Spotify'
        value=''
        placeholder='paste'
        onChange={onChange}
        onBlur={onBlur}
        onSearch={onSearch}
      />
    );
    await user.type(screen.getByLabelText('Spotify URL'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
    await user.tab();
    expect(onBlur).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('hides Search and shows the connected artist', () => {
    render(
      <PrimaryDspRow
        platformId='spotify'
        icon='spotify'
        label='Spotify'
        value='https://x'
        placeholder='paste'
        connectedInfo={{
          artistName: 'Mina Vale',
          artistImageUrl: null,
          externalUrl: 'https://open.spotify.com/artist/x',
        }}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    expect(screen.getByText('Mina Vale')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Profile' })
    ).toBeInTheDocument();
  });
});

describe('AdditionalLinkRow', () => {
  it('edits the URL and removes the row, axe-clean', async () => {
    const user = userEvent.setup();
    const onUrlChange = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <AdditionalLinkRow
        link={{ id: 'sc', platform: 'soundcloud', url: '' }}
        isDarkTheme={false}
        usedPlatforms={new Set(['soundcloud'])}
        onPlatformChange={vi.fn()}
        onUrlChange={onUrlChange}
        onBlur={vi.fn()}
        onRemove={onRemove}
      />
    );
    await user.type(screen.getByLabelText('SoundCloud URL'), 'b');
    expect(onUrlChange).toHaveBeenCalledWith('b');
    await user.click(screen.getByRole('button', { name: 'Remove SoundCloud' }));
    expect(onRemove).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
