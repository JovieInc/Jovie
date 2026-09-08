export const HOMEPAGE_AURA_PIERCE_RED_CSS = `
[data-deliberate-red='homepage-aura-pierce']
  .homepage-name-search
  .input-aura-frame__illumination {
  opacity: 1;
}

[data-deliberate-red='homepage-aura-pierce']
  .homepage-close
  .input-aura-frame--editorial {
  filter: none;
}
`;

export const HOMEPAGE_OFFSET_COPY_RENDERED_RED = {
  candidateRevision: 'fixture-offset-copy',
  route: '/',
  viewport: { width: 900, height: 900 },
  state: 'idle',
  theme: 'light',
  sourceTokensPass: true,
  elements: [
    {
      id: 'connected',
      column: '7 / span 6',
      align: 'end' as const,
      role: 'copy' as const,
      hasMedia: true,
      box: { x: 439, y: 180, width: 400, height: 200 },
    },
    {
      id: 'text-only',
      column: '7 / span 6',
      align: 'end' as const,
      role: 'copy' as const,
      hasMedia: false,
      box: { x: 316, y: 520, width: 400, height: 180 },
    },
  ],
};

export const HOMEPAGE_SHARED_COLUMN_RENDERED_GREEN = {
  ...HOMEPAGE_OFFSET_COPY_RENDERED_RED,
  candidateRevision: 'fixture-shared-column',
  elements: HOMEPAGE_OFFSET_COPY_RENDERED_RED.elements.map(element => ({
    ...element,
    box: { ...element.box, x: 439 },
  })),
};

export const HOMEPAGE_SOURCE_ONLY_ACCEPTANCE_RED = {
  candidateRevision: 'fixture-source-only',
  route: '/',
  viewport: { width: 1440, height: 900 },
  state: 'idle',
  theme: 'light',
  sourceTokensPass: true,
  rendered: {
    aligned: false,
    boxes: HOMEPAGE_OFFSET_COPY_RENDERED_RED.elements,
  },
  screenshotBaselineUpdated: true,
};

export const HOMEPAGE_EXACT_CANDIDATE_ACCEPTANCE_GREEN = {
  candidateRevision: 'fixture-exact-candidate',
  route: '/',
  viewport: { width: 1440, height: 900 },
  state: 'idle',
  theme: 'light',
  sourceTokensPass: true,
  rendered: {
    aligned: true,
    boxes: HOMEPAGE_SHARED_COLUMN_RENDERED_GREEN.elements,
  },
  screenshotBaselineUpdated: false,
};
