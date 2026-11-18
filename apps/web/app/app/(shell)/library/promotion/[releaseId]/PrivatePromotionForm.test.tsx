// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivatePromotionForm } from './PrivatePromotionForm';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: navigate }) }));
vi.mock('@jovie/ui', () => ({ Button: 'button' }));

afterEach(() => vi.unstubAllGlobals());

it('saves edited copy for the exact selected work and reopens the returned private document', async () => {
  navigate.mockClear();
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ documentId: 'persisted-draft' }));
  vi.stubGlobal('fetch', request);
  render(
    <PrivatePromotionForm
      profileId='owner'
      releaseId='selected-work'
      title='Same title'
      context={{
        phase: 'released',
        destination: 'https://example.test/selected',
      }}
    />
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'The creator’s own detail' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const copy = screen.getByRole('textbox');
  expect((copy as HTMLTextAreaElement).value).toContain(
    'https://example.test/selected'
  );
  fireEvent.change(copy, { target: { value: 'An edited private caption' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
  await screen.findByRole('alert');
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(
      '/app/library?document=persisted-draft'
    )
  );
  const [url, options] = request.mock.calls[0];
  expect(url).toBe('/api/library/documents');
  expect(JSON.parse(options.body)).toMatchObject({
    body: 'An edited private caption',
    catalogSelection: { profileId: 'owner', releaseId: 'selected-work' },
  });
  expect(request.mock.calls[1][1].body).toEqual(options.body);
});
