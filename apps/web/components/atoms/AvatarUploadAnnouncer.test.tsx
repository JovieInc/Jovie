import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarUploadAnnouncer } from './AvatarUploadAnnouncer';

const liveRegions = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[aria-live]'));

describe('AvatarUploadAnnouncer', () => {
  it('announces nothing while idle', async () => {
    const { container } = render(
      <AvatarUploadAnnouncer progress={0} status='idle' />
    );

    expect(liveRegions(container)).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('announces rounded progress politely while uploading', async () => {
    const { container, rerender } = render(
      <AvatarUploadAnnouncer progress={41.6} status='uploading' />
    );

    const [region] = liveRegions(container);
    expect(region).toHaveTextContent('Uploading profile photo: 42% complete');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveClass('sr-only');
    await expectNoA11yViolations(container);

    rerender(<AvatarUploadAnnouncer progress={88} status='uploading' />);
    expect(liveRegions(container)[0]).toHaveTextContent('88% complete');
  });

  it('announces success politely once the upload finishes', async () => {
    const { container } = render(
      <AvatarUploadAnnouncer progress={100} status='success' />
    );

    const regions = liveRegions(container);
    expect(regions.at(-1)).toHaveTextContent(
      'Profile photo uploaded successfully'
    );
    expect(regions.at(-1)).toHaveAttribute('aria-live', 'polite');
    await expectNoA11yViolations(container);
  });

  it('announces a failure assertively', async () => {
    const { container } = render(
      <AvatarUploadAnnouncer progress={0} status='error' />
    );

    const regions = liveRegions(container);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveTextContent('Profile photo upload failed');
    expect(regions[0]).toHaveAttribute('aria-live', 'assertive');
    await expectNoA11yViolations(container);
  });
});
