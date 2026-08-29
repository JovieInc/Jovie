import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarn,
    error: vi.fn(),
  },
}));

import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';
import {
  AuthFormSkeleton,
  ButtonSkeleton,
  CardSkeleton,
  LoadingSkeleton,
  ProfileSkeleton,
  SocialBarSkeleton,
  TableSkeleton,
} from './LoadingSkeleton';

describe('LoadingSkeleton', () => {
  beforeEach(() => {
    loggerWarn.mockClear();
  });

  it('exposes Title Case loading labels for profile, actions, and auth', () => {
    render(
      <>
        <ProfileSkeleton />
        <ButtonSkeleton />
        <SocialBarSkeleton />
        <AuthFormSkeleton />
      </>
    );

    expect(screen.getByLabelText('Loading Artist Profile')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading Artist Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading Artist Tagline')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading Action Button')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Loading Social Media Links')
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Loading Authentication Form')
    ).toBeInTheDocument();
  });

  it('accepts valid decimal and fractional Tailwind size utilities', () => {
    const { container } = render(
      <LoadingSkeleton height='h-3.5' width='w-1/2' rounded='full' />
    );

    const skeleton = container.querySelector('[aria-hidden="true"]');

    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('h-3.5');
    expect(skeleton?.className).toContain('w-1/2');
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('rejects empty size tokens', () => {
    const { container } = render(<LoadingSkeleton height='h-' width='w-' />);

    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toHaveClass('h-4', 'w-full');
    expect(skeleton).not.toHaveClass('h-', 'w-');
    expect(loggerWarn).toHaveBeenCalledTimes(2);
  });

  it('passes the canonical loading label through the compatibility facade', () => {
    render(
      <LoadingSkeleton
        label='Loading audience'
        lines={2}
        height='h-6'
        width='w-48'
        rounded='lg'
      />
    );

    const status = screen.getByRole('status', { name: 'Loading audience' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('data-lines', '2');
    expect(status).toHaveAttribute('data-height', 'h-6');
    expect(status).toHaveAttribute('data-width', 'w-48');
    expect(status).toHaveAttribute('data-rounded', 'lg');
    expect(status.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it('keeps validated geometry authoritative over caller className', () => {
    const { container } = render(
      <LoadingSkeleton
        className='h-[13px] w-[29px]'
        height='h-6'
        width='w-48'
      />
    );

    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toHaveClass('h-6', 'w-48');
    expect(skeleton).not.toHaveClass('h-[13px]', 'w-[29px]');
  });

  it.each([
    ['profile', <ProfileSkeleton key='profile' />],
    ['button', <ButtonSkeleton key='button' />],
    ['social bar', <SocialBarSkeleton key='social-bar' />],
    ['auth form', <AuthFormSkeleton key='auth-form' />],
    ['card', <CardSkeleton key='card' />],
    ['table', <TableSkeleton key='table' rows={2} columns={2} />],
  ])('keeps the %s composite on one named loading owner', (_name, node) => {
    const { container } = render(node);

    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
  });

  it('uses the semantic separator token in the auth composition', () => {
    const { container } = render(<AuthFormSkeleton />);
    const separators = container.querySelectorAll(
      '[aria-hidden="true"] > .border-subtle'
    );

    expect(separators).toHaveLength(2);
    separators.forEach(separator => {
      expect(separator).toHaveClass('border-t', 'border-subtle');
      expect(separator.className).not.toContain('bg-white/8');
    });
  });

  it('warns and falls back for invalid size utilities', () => {
    const { container } = render(
      <LoadingSkeleton height='rounded-md' width='grid-cols-2' />
    );

    const skeleton = container.querySelector('[aria-hidden="true"]');

    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('h-4');
    expect(skeleton?.className).toContain('w-full');
    expect(skeleton?.className).not.toContain('rounded-md');
    expect(skeleton?.className).not.toContain('grid-cols-2');
    expect(loggerWarn).toHaveBeenCalledTimes(2);
    expect(loggerWarn).toHaveBeenNthCalledWith(
      1,
      'Invalid height class "rounded-md". Using default value instead.',
      undefined,
      'LoadingSkeleton'
    );
    expect(loggerWarn).toHaveBeenNthCalledWith(
      2,
      'Invalid width class "grid-cols-2". Using default value instead.',
      undefined,
      'LoadingSkeleton'
    );
  });

  it('rejects arbitrary size values so reserved geometry stays tokenized', () => {
    const { container } = render(
      <LoadingSkeleton height='h-[13px]' width='w-[29px]' />
    );

    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toHaveClass('h-4', 'w-full');
    expect(skeleton).not.toHaveClass('h-[13px]', 'w-[29px]');
    expect(loggerWarn).toHaveBeenCalledTimes(2);
  });
});
