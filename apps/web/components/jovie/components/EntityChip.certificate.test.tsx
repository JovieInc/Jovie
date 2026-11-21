import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityChip } from './EntityChip';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: ComponentProps<'img'>) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

const data = { kind: 'release', id: 'rel_1', label: 'Sober' } as const;

describe('EntityChip certificate', () => {
  it('renders a read-only chip without a remove button', async () => {
    const { container } = render(<EntityChip data={data} />);

    expect(screen.getByTestId('entity-chip')).toHaveAttribute(
      'title',
      'Release: Sober'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('removes the entity when the remove button is pressed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { container } = render(
      <EntityChip data={data} onRemove={onRemove} />
    );

    await user.click(screen.getByRole('button', { name: 'Remove Sober' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows a thumbnail when one is provided', async () => {
    const { container } = render(
      <EntityChip data={{ ...data, thumbnail: 'https://example.com/a.png' }} />
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/a.png'
    );
    await expectNoA11yViolations(container);
  });
});
