import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsRow } from './SettingsRow';

describe('SettingsRow', () => {
  it('renders the label and the control slot', () => {
    render(
      <SettingsRow label='Email' control={<span>tim@example.com</span>} />
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('tim@example.com')).toBeInTheDocument();
  });

  it('renders an optional description below the label', () => {
    render(
      <SettingsRow
        label='Two-factor'
        description='Required on prod workspaces'
        control={<span>off</span>}
      />
    );
    expect(screen.getByText('Required on prod workspaces')).toBeInTheDocument();
  });

  it('omits the description when not provided', () => {
    const { container } = render(
      <SettingsRow label='Email' control={<span>x</span>} />
    );
    // Only the label paragraph; no description paragraph
    expect(container.querySelectorAll('p').length).toBe(1);
  });

  it('applies the danger tone to the label when tone is danger', () => {
    render(
      <SettingsRow
        label='Delete account'
        tone='danger'
        control={<span>x</span>}
      />
    );
    expect(screen.getByText('Delete account').className).toContain('rose');
  });

  it('draws a divider when divider is true', () => {
    const { container } = render(
      <SettingsRow divider label='Email' control={<span>x</span>} />
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'border-t'
    );
  });
});
