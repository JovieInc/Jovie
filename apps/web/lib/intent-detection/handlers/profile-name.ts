import { updateProfileByClerkId } from '@/lib/services/profile/mutations';
import type { DetectedIntent } from '../types';
import type { CRUDHandler, CRUDResult, HandlerContext } from './types';

const MAX_DISPLAY_NAME_LENGTH = 100;

export const profileNameHandler: CRUDHandler = {
  async handle(
    intent: DetectedIntent,
    context: HandlerContext
  ): Promise<CRUDResult> {
    const newName = intent.extractedData.value;

    if (!newName || newName.length === 0) {
      return {
        success: false,
        message: 'I need a name to set. What should your display name be?',
      };
    }

    if (newName.length > MAX_DISPLAY_NAME_LENGTH) {
      return {
        success: false,
        message: `That name is too long (${newName.length} characters). Display names can be up to ${MAX_DISPLAY_NAME_LENGTH} characters.`,
      };
    }

    const updated = await updateProfileByClerkId(context.clerkUserId, {
      displayName: newName,
    });

    if (!updated) {
      return {
        success: false,
        message: 'Could not find your profile. Please try again.',
      };
    }

    return {
      success: true,
      message: `Done! Your display name is now "${newName}".`,
      data: { displayName: newName },
    };
  },
};
