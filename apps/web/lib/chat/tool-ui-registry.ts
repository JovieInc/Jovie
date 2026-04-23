export type ToolUiRenderer = 'artifact' | 'status';
export type ToolUiHint = 'artifact' | 'status';

export interface ToolUiConfig {
  readonly label: string;
  readonly uiHint: ToolUiHint;
  readonly renderer: ToolUiRenderer;
  readonly loadingTitle?: string;
  readonly successTitle?: string;
  readonly errorTitle?: string;
}

export const TOOL_UI_REGISTRY = {
  proposeAvatarUpload: {
    label: 'Profile photo',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Getting your photo ready…',
    successTitle: 'Photo ready to upload',
    errorTitle: "Couldn't prepare your photo",
  },
  proposeSocialLink: {
    label: 'Link',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Adding your link…',
    successTitle: 'Link added',
    errorTitle: "Couldn't add that link",
  },
  proposeSocialLinkRemoval: {
    label: 'Link',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Removing the link…',
    successTitle: 'Link removed',
    errorTitle: "Couldn't remove that link",
  },
  submitFeedback: {
    label: 'Feedback',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Sending your feedback…',
    successTitle: 'Feedback sent',
    errorTitle: "Couldn't send your feedback",
  },
  showTopInsights: {
    label: 'Insights',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Checking your signals…',
    successTitle: 'Here are your insights',
    errorTitle: "Couldn't load your insights",
  },
  proposeProfileEdit: {
    label: 'Profile',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Updating your profile…',
    successTitle: 'Profile updated',
    errorTitle: "Couldn't update your profile",
  },
  checkCanvasStatus: {
    label: 'Canvas',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Checking Canvas…',
    successTitle: 'Canvas checked',
    errorTitle: "Couldn't check Canvas",
  },
  suggestRelatedArtists: {
    label: 'Related artists',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Finding related artists…',
    successTitle: 'Found related artists',
    errorTitle: "Couldn't find related artists",
  },
  writeWorldClassBio: {
    label: 'Bio',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Writing your bio…',
    successTitle: 'Bio ready',
    errorTitle: "Couldn't write your bio",
  },
  generateCanvasPlan: {
    label: 'Canvas plan',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Planning your Canvas video…',
    successTitle: 'Canvas plan ready',
    errorTitle: "Couldn't plan your Canvas",
  },
  generateAlbumArt: {
    label: 'Album art',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Creating your album art…',
    successTitle: 'Album art ready',
    errorTitle: "Couldn't create your album art",
  },
  createPromoStrategy: {
    label: 'Promo strategy',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Building your promo plan…',
    successTitle: 'Promo plan ready',
    errorTitle: "Couldn't build your promo plan",
  },
  markCanvasUploaded: {
    label: 'Canvas',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Updating Canvas…',
    successTitle: 'Canvas updated',
    errorTitle: "Couldn't update Canvas",
  },
  formatLyrics: {
    label: 'Lyrics',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Formatting your lyrics…',
    successTitle: 'Lyrics formatted',
    errorTitle: "Couldn't format your lyrics",
  },
  createRelease: {
    label: 'Release',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Creating your release…',
    successTitle: 'Release created',
    errorTitle: "Couldn't create your release",
  },
  generateReleasePitch: {
    label: 'Release pitch',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Writing your pitches…',
    successTitle: 'Pitches ready',
    errorTitle: "Couldn't write your pitches",
  },
} as const satisfies Record<string, ToolUiConfig>;

function startCaseFromCamelCase(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[-_]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replaceAll(/\b\w/g, letter => letter.toUpperCase());
}

export function getToolUiConfig(toolName: string): ToolUiConfig {
  const existing = TOOL_UI_REGISTRY[toolName as keyof typeof TOOL_UI_REGISTRY];
  if (existing) return existing;

  const pretty = startCaseFromCamelCase(toolName);
  const sentence = pretty.charAt(0) + pretty.slice(1).toLowerCase();
  const lowered = sentence.toLowerCase();
  return {
    label: pretty,
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: `Working on ${lowered}…`,
    successTitle: `${sentence} done`,
    errorTitle: `Couldn't finish ${lowered}`,
  };
}
