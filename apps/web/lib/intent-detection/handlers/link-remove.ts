import type { DetectedIntent } from '../types';
import type { CRUDHandler, CRUDResult } from './types';

export const linkRemoveHandler: CRUDHandler = {
  async handle(intent: DetectedIntent): Promise<CRUDResult> {
    const { platform } = intent.extractedData;

    if (!platform) {
      return {
        success: false,
        message: 'Which link would you like to remove?',
      };
    }

    return {
      success: true,
      message: `I'll remove your ${platform} link.`,
      clientAction: 'propose_social_link_removal',
      data: { platform },
    };
  },
};
