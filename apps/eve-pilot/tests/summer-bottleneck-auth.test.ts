import { describe, expect, it } from 'vitest';
import {
  JOVIE_PRODUCTION_OIDC_SUBJECT,
  ovieSummerBottleneckOidcAuth,
  readBoundedSummerBottleneckJson,
} from '../agent/channels/summer-bottleneck';

describe('Summer bottleneck OIDC boundary', () => {
  it('pins the only accepted external subject to Jovie production', () => {
    expect(JOVIE_PRODUCTION_OIDC_SUBJECT).toBe(
      'owner:jovie:project:jovie:environment:production'
    );
  });

  it('rejects an unsigned request', async () => {
    await expect(
      ovieSummerBottleneckOidcAuth(
        new Request('https://eve.example.com/ovie/v1/summer-bottleneck/events')
      )
    ).resolves.toBeNull();
  });

  it('reads a streamed JSON body within the fixed byte limit', async () => {
    const encoder = new TextEncoder();
    const request = new Request('https://eve.example.com/events', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"eventId":'));
          controller.enqueue(encoder.encode('"evt_0001"}'));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);

    await expect(readBoundedSummerBottleneckJson(request)).resolves.toEqual({
      eventId: 'evt_0001',
    });
  });

  it('rejects declared or streamed bodies above the byte limit', async () => {
    const declared = new Request('https://eve.example.com/events', {
      method: 'POST',
      headers: { 'content-length': String(65 * 1024) },
      body: '{}',
    });
    await expect(readBoundedSummerBottleneckJson(declared)).rejects.toThrow(
      'body-too-large'
    );

    const streamed = new Request('https://eve.example.com/events', {
      method: 'POST',
      body: new Uint8Array(65 * 1024),
    });
    await expect(readBoundedSummerBottleneckJson(streamed)).rejects.toThrow(
      'body-too-large'
    );
  });
});
