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
  importBioFromUrl: {
    label: 'Bio import',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Importing your bio…',
    successTitle: 'Bio imported',
    errorTitle: "Couldn't import that bio",
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
  createMerch: {
    label: 'Merch',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Creating merch options…',
    successTitle: 'Merch options ready',
    errorTitle: "Couldn't create merch",
  },
  previewMerchOptions: {
    label: 'Merch',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Preparing merch options…',
    successTitle: 'Merch options ready',
    errorTitle: "Couldn't prepare merch",
  },
  selectMerchDesign: {
    label: 'Merch selection',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Saving your merch pick…',
    successTitle: 'Merch pick saved',
    errorTitle: "Couldn't save that merch pick",
  },
  publishMerchCard: {
    label: 'Merch publish',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Publishing merch…',
    successTitle: 'Merch is live',
    errorTitle: "Couldn't publish merch",
  },
  pauseMerchCard: {
    label: 'Merch pause',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Pausing merch…',
    successTitle: 'Merch paused',
    errorTitle: "Couldn't pause merch",
  },
  unpauseMerchCard: {
    label: 'Merch unpause',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Making merch live…',
    successTitle: 'Merch is live',
    errorTitle: "Couldn't make merch live",
  },
  deleteOrArchiveMerchCard: {
    label: 'Merch archive',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Archiving merch…',
    successTitle: 'Merch archived',
    errorTitle: "Couldn't archive merch",
  },
  reorderMerchCards: {
    label: 'Merch order',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Reordering merch…',
    successTitle: 'Merch reordered',
    errorTitle: "Couldn't reorder merch",
  },
  optimizeMerchCards: {
    label: 'Merch optimization',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Optimizing merch…',
    successTitle: 'Merch optimized',
    errorTitle: "Couldn't optimize merch",
  },
  showMerchSales: {
    label: 'Merch sales',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Checking merch sales…',
    successTitle: 'Merch sales ready',
    errorTitle: "Couldn't load merch sales",
  },
  showArtistPayouts: {
    label: 'Merch payouts',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Checking merch payouts…',
    successTitle: 'Merch payouts ready',
    errorTitle: "Couldn't load merch payouts",
  },
  showAccountStatus: {
    label: 'Account',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Checking your account…',
    successTitle: 'Account status ready',
    errorTitle: "Couldn't check your account",
  },
  showUsage: {
    label: 'Usage',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Checking usage…',
    successTitle: 'Usage ready',
    errorTitle: "Couldn't check usage",
  },
  openBillingPortal: {
    label: 'Billing',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Opening billing…',
    successTitle: 'Billing ready',
    errorTitle: "Couldn't open billing",
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
  searchSpotifyArtist: {
    label: 'Spotify artist',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Finding the right Spotify artist…',
    successTitle: 'Spotify picker ready',
    errorTitle: "Couldn't search Spotify",
  },
  confirmSpotifyArtist: {
    label: 'Spotify profile',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Pulling Spotify profile data…',
    successTitle: 'Spotify profile matched',
    errorTitle: "Couldn't load that Spotify profile",
  },
  checkHandle: {
    label: 'Handle',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Checking the handle…',
    successTitle: 'Handle checked',
    errorTitle: "Couldn't check that handle",
  },
  recordInterviewSignal: {
    label: 'Interview signal',
    uiHint: 'status',
    renderer: 'status',
    loadingTitle: 'Noting context…',
    successTitle: 'Context noted',
    errorTitle: "Couldn't note that context",
  },
  proposeNextStep: {
    label: 'Next step',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Choosing the next step…',
    successTitle: 'Next step ready',
    errorTitle: "Couldn't choose the next step",
  },
  proposeCheckout: {
    label: 'Checkout',
    uiHint: 'artifact',
    renderer: 'artifact',
    loadingTitle: 'Preparing checkout…',
    successTitle: 'Checkout ready',
    errorTitle: "Couldn't prepare checkout",
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
