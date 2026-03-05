import type { DetectedIntent } from '../types';
import type { CRUDHandler, CRUDResult } from './types';

export const linkAddHandler: CRUDHandler = {
  async handle(intent: DetectedIntent): Promise<CRUDResult> {
    const { platform, url } = intent.extractedData;

    if (url) {
      return {
        success: true,
        message: "I'll add that link for you.",
        clientAction: 'propose_social_link',
        data: { platform: platform || '', url },
      };
    }

    if (platform) {
      return {
        success: true,
        message: `To add your ${platform} link, please paste the URL.`,
        clientAction: 'prompt_link_url',
        data: { platform },
      };
    }

    return {
      success: false,
      message:
        'Which platform would you like to add? (e.g., Instagram, Spotify, TikTok)',
    };
  },
};
