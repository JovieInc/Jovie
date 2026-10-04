import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmartLinksLanding } from './SmartLinksLanding';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly src: string }) => (
    <img alt={props.alt} src={props.src} />
  ),
}));

describe('SmartLinksLanding generic hero', () => {
  afterEach(() => {
    delete process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV;
  });

  it('keeps the music headline while the flag is off', () => {
    render(<SmartLinksLanding />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'One Link. Their Music App.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Make Every Link Sing.' })
    ).toBeInTheDocument();
  });

  it('uses the generic headline and a release example when the flag is on', () => {
    process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV = 'true';
    render(<SmartLinksLanding />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Share your work with one link.',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/Example: a release\./u)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'One Link. Their Music App.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One link, three beats.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Create a smart link.' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Make Every Link Sing.' })
    ).not.toBeInTheDocument();
  });
});
