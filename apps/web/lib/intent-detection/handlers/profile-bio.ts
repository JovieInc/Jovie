import { updateProfileByClerkId } from '@/lib/services/profile/mutations';
import type { DetectedIntent } from '../types';
import type { CRUDHandler, CRUDResult, HandlerContext } from './types';

const MAX_BIO_LENGTH = 500;

export const profileBioHandler: CRUDHandler = {
  async handle(
    intent: DetectedIntent,
    context: HandlerContext
  ): Promise<CRUDResult> {
    const newBio = intent.extractedData.value;

    if (!newBio || newBio.length === 0) {
      return {
        success: false,
        message: 'I need the bio text. What should your bio say?',
      };
    }

    if (newBio.length > MAX_BIO_LENGTH) {
      return {
        success: false,
        message: `That bio is too long (${newBio.length} characters). Bios can be up to ${MAX_BIO_LENGTH} characters.`,
      };
    }

    const updated = await updateProfileByClerkId(context.clerkUserId, {
      bio: newBio,
    });

    if (!updated) {
      return {
        success: false,
        message: 'Could not find your profile. Please try again.',
      };
    }

    return {
      success: true,
      message: 'Done! Your bio has been updated.',
      data: { bio: newBio },
    };
  },
};
