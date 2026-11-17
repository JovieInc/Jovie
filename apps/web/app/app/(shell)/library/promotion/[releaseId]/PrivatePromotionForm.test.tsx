// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivatePromotionForm } from './PrivatePromotionForm';

vi.mock('@jovie/ui', () => ({ Button: 'button' }));

afterEach(() => vi.unstubAllGlobals());

it('saves edited copy for the exact selected work and reopens the returned private document', async () => {
  const assign = vi.fn();
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ documentId: 'persisted-draft' }));
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('location', { assign });
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
  fireEvent.click(screen.getByRole('button', { name: 'Prepare caption' }));
  const copy = screen.getByRole('textbox');
  expect((copy as HTMLTextAreaElement).value).toContain(
    'https://example.test/selected'
  );
  fireEvent.change(copy, { target: { value: 'An edited private caption' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
  await screen.findByRole('alert');
  expect(assign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
  await waitFor(() =>
    expect(assign).toHaveBeenCalledWith('/app/library?document=persisted-draft')
  );
  const [url, options] = request.mock.calls[0];
  expect(url).toBe('/api/library/documents');
  expect(JSON.parse(options.body)).toMatchObject({
    body: 'An edited private caption',
    catalogSelection: { profileId: 'owner', releaseId: 'selected-work' },
  });
  expect(request.mock.calls[1][1].body).toEqual(options.body);
});
