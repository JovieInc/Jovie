import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AuthFormSkeleton,
  ButtonSkeleton,
  ProfileSkeleton,
  SocialBarSkeleton,
} from './LoadingSkeleton';

describe('LoadingSkeleton', () => {
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
});
