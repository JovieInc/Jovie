export type ToolUiRenderer = 'artifact' | 'status';
export type ToolUiHint = 'artifact' | 'status';

export interface ToolUiConfig {
  readonly label: string;
  readonly uiHint: ToolUiHint;
  readonly renderer: ToolUiRenderer;
  readonly loadingTitle?: string;
  readonly errorTitle?: string;
}

export const TOOL_UI_REGISTRY = {
  proposeAvatarUpload: {
    label: 'Avatar Upload',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Preparing Photo Upload...',
    errorTitle: 'Photo Upload Failed',
  },
  proposeSocialLink: {
    label: 'Social Link',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Adding Link...',
    errorTitle: 'Link Update Failed',
  },
  proposeSocialLinkRemoval: {
    label: 'Social Link Removal',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Removing Link...',
    errorTitle: 'Link Removal Failed',
  },
  submitFeedback: {
    label: 'Feedback',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Submitting Feedback...',
    errorTitle: 'Feedback Submission Failed',
  },
  showTopInsights: {
    label: 'Top Insights',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Checking Your Signals...',
    errorTitle: 'Insights Unavailable',
  },
  proposeProfileEdit: {
    label: 'Profile Edit',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Editing Profile...',
    errorTitle: 'Profile Edit Failed',
  },
  checkCanvasStatus: {
    label: 'Canvas Status',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Checking Canvas Status...',
    errorTitle: 'Canvas Check Failed',
  },
  suggestRelatedArtists: {
    label: 'Related Artists',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Finding Related Artists...',
    errorTitle: 'Related Artist Search Failed',
  },
  writeWorldClassBio: {
    label: 'Artist Bio',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Writing Bio...',
    errorTitle: 'Bio Draft Failed',
  },
  generateCanvasPlan: {
    label: 'Canvas Plan',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Planning Canvas Video...',
    errorTitle: 'Canvas Plan Failed',
  },
  generateAlbumArt: {
    label: 'Album Art',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Generating Album Art...',
    errorTitle: 'Album Art Failed',
  },
  createPromoStrategy: {
    label: 'Promo Strategy',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Building Promo Strategy...',
    errorTitle: 'Promo Strategy Failed',
  },
  markCanvasUploaded: {
    label: 'Canvas Upload',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Updating Canvas Status...',
    errorTitle: 'Canvas Update Failed',
  },
  formatLyrics: {
    label: 'Lyrics Format',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Formatting Lyrics...',
    errorTitle: 'Lyrics Format Failed',
  },
  createRelease: {
    label: 'Create Release',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Creating Release...',
    errorTitle: 'Release Creation Failed',
  },
  generateReleasePitch: {
    label: 'Release Pitch',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Generating Pitches...',
    errorTitle: 'Pitch Generation Failed',
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
  return (
    TOOL_UI_REGISTRY[toolName as keyof typeof TOOL_UI_REGISTRY] ?? {
      label: startCaseFromCamelCase(toolName),
      uiHint: 'status',
      renderer: 'status',
      loadingTitle: `${startCaseFromCamelCase(toolName)} In Progress...`,
      errorTitle: `${startCaseFromCamelCase(toolName)} Failed`,
    }
  );
}
