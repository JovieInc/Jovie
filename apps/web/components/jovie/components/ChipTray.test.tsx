import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { TrayChip } from '../hooks/useChipTray';
import { ChipTray } from './ChipTray';

const chips: readonly TrayChip[] = [
  { uid: 'chip-skill', type: 'skill', id: 'generateAlbumArt' },
  {
    uid: 'chip-release',
    type: 'entity',
    kind: 'release',
    id: 'rel_1',
    label: 'Midnight Drive',
  },
];

describe('ChipTray', () => {
  it('renders skills by label and removes the chip at its index', async () => {
    const user = userEvent.setup();
    const onRemoveAt = vi.fn();
    const { container } = render(
      <ChipTray chips={chips} onRemoveAt={onRemoveAt} />
    );

    expect(screen.getByTestId('skill-chip')).toHaveTextContent(
      'Generate album art'
    );
    expect(screen.getByTestId('entity-chip')).toHaveTextContent(
      'Midnight Drive'
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove Midnight Drive' })
    );
    expect(onRemoveAt).toHaveBeenLastCalledWith(1);

    await user.click(
      screen.getByRole('button', { name: 'Remove Generate album art skill' })
    );
    expect(onRemoveAt).toHaveBeenLastCalledWith(0);
    await expectNoA11yViolations(container);
  });

  it('removes a chip from the keyboard', async () => {
    const user = userEvent.setup();
    const onRemoveAt = vi.fn();
    render(<ChipTray chips={chips} onRemoveAt={onRemoveAt} />);

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Remove Generate album art skill' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRemoveAt).toHaveBeenCalledWith(0);
  });

  it('renders nothing for an empty tray', () => {
    const { container } = render(<ChipTray chips={[]} onRemoveAt={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the skill id when the registry has no label', () => {
    render(
      <ChipTray
        chips={[{ uid: 'chip-unknown', type: 'skill', id: 'retiredSkill' }]}
        onRemoveAt={vi.fn()}
      />
    );
    expect(screen.getByTestId('skill-chip')).toHaveTextContent('retiredSkill');
  });

  it('keeps long and right-to-left labels named for removal', async () => {
    const long =
      'Midnight Drive (Deluxe Anniversary Edition) [Remastered Extended Mix]';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChipTray
          chips={[
            {
              uid: 'chip-long',
              type: 'entity',
              kind: 'release',
              id: 'rel_long',
              label: long,
            },
            {
              uid: 'chip-ar',
              type: 'entity',
              kind: 'artist',
              id: 'art_ar',
              label: 'عمرو دياب',
            },
          ]}
          onRemoveAt={vi.fn()}
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: `Remove ${long}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove عمرو دياب' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
