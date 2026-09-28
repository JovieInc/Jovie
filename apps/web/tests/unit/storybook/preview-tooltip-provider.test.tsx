import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui/atoms/tooltip';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import preview from '../../../.storybook/preview';

vi.mock('../../../components/providers/ToastProvider', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));

it('provides the real UI tooltip context to Storybook stories', async () => {
  const decorators = preview.decorators;
  const decorate = Array.isArray(decorators) ? decorators[0] : decorators;
  expect(decorate).toBeTypeOf('function');
  if (!decorate) return;

  const story = () => (
    <Tooltip defaultOpen>
      <TooltipTrigger>
        <button type='button'>Inspect keyboard shortcut</button>
      </TooltipTrigger>
      <TooltipContent>Shortcut details</TooltipContent>
    </Tooltip>
  );
  const DecoratedStory = () => decorate(story, {} as never) as ReactNode;
  render(<DecoratedStory />);

  expect(
    screen.getByRole('button', { name: 'Inspect keyboard shortcut' })
  ).toBeVisible();
  expect(await screen.findByText('Shortcut details')).toBeVisible();
});
