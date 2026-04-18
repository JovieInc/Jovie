import { describe, expect, it, vi } from 'vitest';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { fastRender } from '@/tests/utils/fast-render';

describe('DashboardCard', () => {
  it('renders a non-interactive card as a div with default padding', () => {
    const { getByTestId } = fastRender(
      <DashboardCard data-testid='card'>Card body</DashboardCard>
    );

    const card = getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card.className).toContain('p-4');
    expect(card.className).toContain('bg-surface-1');
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('shadow-none');
  });

  it('renders a clickable card as a button', () => {
    const onClick = vi.fn();
    const { getByRole } = fastRender(
      <DashboardCard onClick={onClick}>Click me</DashboardCard>
    );

    const button = getByRole('button', { name: 'Click me' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('removes the interactive hover treatment when hover is disabled', () => {
    const { getByTestId } = fastRender(
      <DashboardCard data-testid='card' variant='interactive' hover={false}>
        No hover
      </DashboardCard>
    );

    expect(getByTestId('card').className).toContain('hover:shadow-none');
  });
});
