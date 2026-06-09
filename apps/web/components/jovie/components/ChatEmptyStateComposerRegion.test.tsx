import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';

describe('ChatEmptyStateComposerRegion', () => {
  it('softens the background logo with a radial edge fade', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    const logo = screen.getByTestId('chat-empty-state-logo');
    const mask = logo.style.maskImage;

    expect(mask).toContain('radial-gradient');
    expect(mask).toContain('transparent 86%');
    expect(logo.className).toContain('opacity-70');
  });
});
