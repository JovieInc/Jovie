'use client';

import { DesktopQrOverlay } from './DesktopQrOverlay';

// Previously wrapped `DesktopQrOverlay` in a `dynamic({ ssr: false })` import.
// That bailed the parent SSR tree to client-side rendering and emitted
// `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">` in the streaming
// payload — which on the /[username] route forced the animated skeleton from
// `loading.tsx` to be the initial visible HTML for every cold visit
// (JOV-2273).
//
// `DesktopQrOverlay` initial state is `mode: 'hidden'` and renders `null` on
// first paint, so SSR is safe: server-rendered output is also `null`, and the
// component progressively enables itself in `useEffect` once
// `globalThis.matchMedia('(min-width: 768px)')` resolves on the client. The
// `ssr: false` deferral was costing us a visible CSR bailout for no rendering
// benefit.
export function DesktopQrOverlayClient({
  handle,
}: Readonly<{ handle: string }>) {
  return <DesktopQrOverlay handle={handle} />;
}
