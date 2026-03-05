/**
 * Handler Registry
 * Maps IntentCategory to handler implementations.
 */

import { IntentCategory } from '../types';
import { avatarUploadHandler } from './avatar-upload';
import { linkAddHandler } from './link-add';
import { linkRemoveHandler } from './link-remove';
import { profileBioHandler } from './profile-bio';
import { profileNameHandler } from './profile-name';
import type { CRUDHandler } from './types';

export const HANDLER_REGISTRY: Partial<Record<IntentCategory, CRUDHandler>> = {
  [IntentCategory.PROFILE_UPDATE_NAME]: profileNameHandler,
  [IntentCategory.PROFILE_UPDATE_BIO]: profileBioHandler,
  [IntentCategory.LINK_ADD]: linkAddHandler,
  [IntentCategory.LINK_REMOVE]: linkRemoveHandler,
  [IntentCategory.AVATAR_UPLOAD]: avatarUploadHandler,
};
