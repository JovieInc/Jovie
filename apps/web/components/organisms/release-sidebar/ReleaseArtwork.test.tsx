import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import { ReleaseArtwork } from './ReleaseArtwork';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

describe('ReleaseArtwork', () => {
  it('shows the title, artist and labelled artwork', async () => {
    const { container } = renderWithQueryClient(
      <ReleaseArtwork
        artworkUrl='https://example.com/cover.jpg'
        title='Midnight Drive'
        artistName='Jordan Lee'
        canUploadArtwork={false}
      />
    );

    expect(screen.getByTestId('release-artwork')).toHaveTextContent(
      'Midnight Drive'
    );
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Midnight Drive artwork' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the release label and icon when details are missing', async () => {
    const { container } = renderWithQueryClient(
      <ReleaseArtwork artworkUrl={null} title='' canUploadArtwork={false} />
    );

    expect(screen.getByTestId('release-artwork')).toHaveTextContent('Release');
    expect(
      screen.getByRole('img', { name: 'Release artwork' })
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('swaps a broken image for the fallback icon', () => {
    const { container } = renderWithQueryClient(
      <ReleaseArtwork
        artworkUrl='https://example.com/broken.jpg'
        title='Midnight Drive'
        canUploadArtwork={false}
      />
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Midnight Drive artwork' })
    ).toBeInTheDocument();
  });

  it('uploads a chosen artwork file when the artwork is editable', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:preview');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const onArtworkUpload = vi.fn(async () => 'https://example.com/new.jpg');
    const { container } = renderWithQueryClient(
      <ReleaseArtwork
        artworkUrl='https://example.com/cover.jpg'
        title='Midnight Drive'
        canUploadArtwork
        onArtworkUpload={onArtworkUpload}
      />
    );

    expect(
      screen.getByRole('button', { name: /Upload release artwork/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const file = new File(['art'], 'cover.png', { type: 'image/png' });
    await user.upload(
      screen.getByLabelText('Choose Release Artwork File'),
      file
    );
    await waitFor(() => expect(onArtworkUpload).toHaveBeenCalledWith(file));
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
