import { describe, expect, it } from 'vitest';
import {
  FormDataParseError,
  parseFormDataBody,
} from '@/lib/http/parse-form-data';

function malformedMultipartRequest(): Request {
  return new Request('https://example.com/upload', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=vitest-boundary',
    },
    body: 'not a multipart payload',
  });
}

describe('parseFormDataBody', () => {
  it('returns form data for valid multipart payloads', async () => {
    const body = new FormData();
    body.set('profileId', '00000000-0000-4000-8000-000000000001');

    const request = new Request('https://example.com/upload', {
      method: 'POST',
      body,
    });

    const formData = await parseFormDataBody(request);

    expect(formData.get('profileId')).toBe(
      '00000000-0000-4000-8000-000000000001'
    );
  });

  it('normalizes malformed multipart parser failures', async () => {
    await expect(
      parseFormDataBody(malformedMultipartRequest())
    ).rejects.toThrow(FormDataParseError);
  });

  it('rethrows unrelated form-data parser errors unchanged', async () => {
    const expectedError = new TypeError('synthetic unrelated parser failure');
    const request = {
      bodyUsed: false,
      headers: new Headers(),
      formData: async () => {
        throw expectedError;
      },
    } as unknown as Request;

    await expect(parseFormDataBody(request)).rejects.toBe(expectedError);
  });

  it('rethrows already-consumed body errors unchanged', async () => {
    const expectedError = new TypeError('body stream already read');
    const request = {
      bodyUsed: true,
      headers: new Headers({
        'content-type': 'multipart/form-data; boundary=vitest-boundary',
      }),
      formData: async () => {
        throw expectedError;
      },
    } as unknown as Request;

    await expect(parseFormDataBody(request)).rejects.toBe(expectedError);
  });
});
