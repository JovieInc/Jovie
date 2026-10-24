/** Source-owned feedback and input provenance. Never accept registry additions from a generator. */
export const MARKETING_MEDIA_REFERENCE_REVIEW = {
  id: 'jov-6246-reference-review/2026-09-12/r1',
  evidence: 'https://linear.app/jovie/issue/JOV-6246',
  reviewer: 'Tim White',
  reviewedAt: '2026-09-12',
  scope:
    'Reference preference and bounded implementation only; no unseen master approval, redistribution rights or release-gate changes.',
  rights:
    'Third-party references are inspiration only. No redistribution license established; original images are excluded from shipped assets.',
  capturedAt: '2026-10-16',
  references: [
    {
      id: '5',
      url: null,
      sha256: null,
      extraction: 'Restraint and dark negative space.',
      rejection: 'Exact original capture and author unresolved.',
      provenance: 'unresolved',
    },
    {
      id: '14',
      url: 'https://www.raycast.com/_next/image?q=90&url=%2F_next%2Fstatic%2Fimmutable%2Fmedia%2Fraycast-notes.0khgr6jj73_r6.png&w=3840',
      sha256:
        '908729581d8f9d14c536aba7c41ec31392fa0fcd42215f8c5690b5ed35e73f1c',
      extraction: 'Quiet perimeter and subtle glass.',
      rejection: 'Reject redundant titles around visible product titles.',
      provenance: 'exact-url-capture',
    },
    {
      id: '18',
      url: 'https://images.unsplash.com/photo-1765164478579-2c041dad2c7d',
      sha256:
        '30b506e61f65541ee561c0a689b874bbf45182029bad7c55b7a81aa018b19904',
      extraction:
        'Broad curved boundary, narrow illumination, large dark field.',
      rejection:
        'Extract purposeful leading light; no aggressive diagonal bands.',
      provenance: 'exact-url-capture',
    },
    {
      id: '21',
      url: null,
      sha256: null,
      extraction:
        'Broad low-contrast curves, off-center light, dark negative space.',
      rejection: 'Exact original capture and author unresolved.',
      provenance: 'unresolved',
    },
    {
      id: '22',
      url: 'https://www.raycast.com/uploads/blog-new-raycast/app.png',
      sha256:
        'e8dfc522b9adbe0e55c888b905aec20c2f9accb230ecbbe8fd1ff524010da876',
      extraction:
        'Near-black selective transmission, crisp perimeter, asymmetric light.',
      rejection: 'Reject bevels, plastic volume and uniform haze.',
      provenance: 'exact-url-capture',
    },
    {
      id: '23',
      url: 'https://www.raycast.com/uploads/blog-new-raycast/new-features.png',
      sha256:
        'eb9fa630e95702763aabcd985dd3a02191056d673d36726d2f899ab347bfb0a6',
      extraction: 'Preserve the glass material at module scale.',
      rejection: 'Do not inherit clipped side panels or unrelated controls.',
      provenance: 'exact-url-capture',
    },
    {
      id: '24',
      url: 'https://misc-assets.raycast.com/wallpapers/glaze_1_preview.png',
      sha256:
        '24459dce72c3d7b36d89992bd7acb878720ec8060b3b4af3f5855c1df80ea0a2',
      extraction: 'Light/material quality with one coherent dominant sweep.',
      rejection:
        'Mandatory founder correction: reduce contradicting curves across the whole field.',
      provenance: 'exact-url-capture',
    },
  ],
} as const;

export const MARKETING_MEDIA_TOKEN_FILES = [
  'design/ziawi-color-sot.json',
  'styles/design-system.css',
] as const;
export const MARKETING_MEDIA_TOKEN_REVISION =
  'ziawi-2026-09-25/62267dc6e73c3b9d0b48f4a642e2e2672b2369ff703519bf6d8c602bcd9a20d0' as const;

export interface MarketingMediaRegisteredInput {
  readonly id: string;
  readonly kind:
    | 'real-capture'
    | 'registered-live-presentation'
    | 'generated-artwork';
  readonly recipes: readonly string[];
  readonly revision: string;
  readonly hash: string;
  readonly files: readonly string[];
  readonly rights: string;
  readonly evidence: string;
}
// Generated artwork is admitted only after a rights-backed master record exists.
export const MARKETING_MEDIA_INPUTS: readonly MarketingMediaRegisteredInput[] =
  [
    {
      id: 'capture-demo',
      kind: 'registered-live-presentation',
      recipes: ['compact-glass'],
      revision:
        '2af7c4c60d8f763f0e480d990bff941608e8be08fdd033a15d065c2fdec63483',
      hash: '2af7c4c60d8f763f0e480d990bff941608e8be08fdd033a15d065c2fdec63483',
      files: [
        'components/marketing/artist-profile/CompactGlassCaptureDemo.tsx',
        'components/marketing/artist-profile/CompactGlassModule.tsx',
        'components/marketing/artist-profile/captureShared.tsx',
        'components/marketing/artist-profile/captureShared.css',
        'data/artistProfileCopy.ts',
      ],
      rights: 'jovie-owned',
      evidence:
        'Existing CompactGlassCaptureDemo / ARTIST_PROFILE_COPY.capture, JOV-6248; source eligibility only, not visual master certification.',
    },
    {
      id: 'dashboard-releases-sidebar-desktop',
      kind: 'real-capture',
      recipes: ['dark-glass'],
      revision: 'e04c96ab3605cc134fa2c4f479cd5c078a9ae823',
      hash: 'a0dc630f0c39549bb50f16135142cb6c0810a4b3f079e867f4d72d39bd3405f2',
      files: ['public/product-screenshots/releases-dashboard-sidebar.png'],
      rights: 'jovie-owned',
      evidence:
        'screenshot-catalog/current/manifest.json: marketing-export consumer and publicExportPath; existing approved fixture.',
    },
    {
      id: 'editorial-flow',
      kind: 'registered-live-presentation',
      recipes: ['flowing-accent'],
      revision:
        '7d13a6ddf1ef5edcc77b4172cca0cc1e87bbe07dafb4f01e1fbd36afd30b0699',
      hash: '7d13a6ddf1ef5edcc77b4172cca0cc1e87bbe07dafb4f01e1fbd36afd30b0699',
      files: [
        'components/marketing/MarketingEditorialBackground.tsx',
        'components/marketing/MarketingEditorialBackground.css',
        'data/marketing/editorialBackgrounds.ts',
      ],
      rights: 'jovie-owned',
      evidence:
        'Existing MarketingEditorialBackground flow source, JOV-6249; implementation preview, not certified master.',
    },
    {
      id: 'editorial-soft',
      kind: 'registered-live-presentation',
      recipes: ['soft-editorial-background'],
      revision:
        '7d13a6ddf1ef5edcc77b4172cca0cc1e87bbe07dafb4f01e1fbd36afd30b0699',
      hash: '7d13a6ddf1ef5edcc77b4172cca0cc1e87bbe07dafb4f01e1fbd36afd30b0699',
      files: [
        'components/marketing/MarketingEditorialBackground.tsx',
        'components/marketing/MarketingEditorialBackground.css',
        'data/marketing/editorialBackgrounds.ts',
      ],
      rights: 'jovie-owned',
      evidence:
        'Existing MarketingEditorialBackground soft source, JOV-6249; implementation preview, not certified master.',
    },
  ] as const;

export const MARKETING_MEDIA_PRESENTATION_FILES = [
  'components/marketing/artist-profile/CompactGlassCaptureDemo.tsx',
  'components/marketing/artist-profile/CompactGlassModule.tsx',
  'components/marketing/artist-profile/captureShared.tsx',
  'components/marketing/artist-profile/captureShared.css',
  'data/artistProfileCopy.ts',
  'components/marketing/MarketingEditorialBackground.tsx',
  'components/marketing/MarketingEditorialBackground.css',
  'data/marketing/editorialBackgrounds.ts',
  'components/marketing/ProductScreenshotFrame.tsx',
  'components/marketing/ProductScreenshotFrame.css',
  'components/marketing/MarketingMedia.tsx',
  'data/marketing/mediaRecipes.ts',
] as const;
export const MARKETING_MEDIA_PRESENTATION_REVISION =
  '305fb08ab1d0f9e2262811b1f98851c23b076f77b18e8d28315d981d54982556' as const;
