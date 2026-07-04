import { NextRequest } from 'next/server';

export function malformedMultipartRequest(routePath: string): NextRequest {
  return new NextRequest(`http://localhost:3000${routePath}`, {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=vitest-boundary',
    },
    body: 'not a multipart payload',
  });
}
