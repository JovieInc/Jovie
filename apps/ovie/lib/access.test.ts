import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { accessResponse, isPublicEntry } from './access';

describe('public entry boundary', () => {
  it('defaults to safe navigation methods', () => {
    expect(isPublicEntry('/signin')).toBe(true);
    expect(isPublicEntry('/app/ov/ops')).toBe(false);
  });

  it.each([
    '/signin',
    '/_next/image',
    '/favicon.ico',
    '/api/auth/get-session',
  ])('never exempts server actions at %s', pathname => {
    expect(isPublicEntry(pathname, 'POST', true)).toBe(false);
  });

  it('rejects unsupported auth and page methods', () => {
    expect(isPublicEntry('/api/auth/get-session', 'DELETE')).toBe(false);
    expect(isPublicEntry('/signin', 'POST')).toBe(false);
    expect(isPublicEntry('/_next/static/chunks/app.js', 'PUT')).toBe(false);
  });

  it('never redirects an action request even with a navigation method', async () => {
    const response = accessResponse(
      new NextRequest('https://ovie.example.test/signin', {
        headers: { 'next-action': 'action-id' },
      }),
      'anonymous'
    )!;
    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('workflow migration boundary', () => {
  it.each([
    '/.well-known/workflow/v1/flow',
    '/.well-known/workflow/v1/step',
    '/.well-known/workflow/v1/webhook/token',
    '/.well-known/workflow/v1/manifest.json',
  ])('never treats SDK callback metadata as public authorization at %s', pathname => {
    expect(isPublicEntry(pathname, 'POST')).toBe(false);
    expect(isPublicEntry(pathname, 'GET')).toBe(false);
    const denied = accessResponse(
      new NextRequest(`https://ovie.example.test${pathname}`, {
        method: 'POST',
        headers: {
          'x-vqs-queue-name': '__wkf_workflow_forged',
          'x-vercel-id': 'forged',
        },
      }),
      'anonymous'
    )!;
    expect(denied.status).toBe(401);
  });

  it('reports unavailable execution instead of accepting an unserviceable run', async () => {
    const request = new NextRequest(
      'https://ovie.example.test/api/admin/agent-os/workflows/dry-run',
      { method: 'POST' }
    );
    const response = accessResponse(request, 'admin')!;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        'Workflow execution is unavailable until Ovie callback authentication is verified',
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(accessResponse(request, 'anonymous')!.status).toBe(401);
    expect(accessResponse(request, 'forbidden')!.status).toBe(403);
  });
});
