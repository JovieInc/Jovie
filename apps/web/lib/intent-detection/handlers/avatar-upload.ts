import type { CRUDHandler, CRUDResult } from './types';

export const avatarUploadHandler: CRUDHandler = {
  async handle(): Promise<CRUDResult> {
    return {
      success: true,
      message: "Let's update your profile photo. Use the uploader below.",
      clientAction: 'propose_avatar_upload',
    };
  },
};
