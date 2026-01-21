/**
 * Magic Profile Avatar
 *
 * This file re-exports from the avatar/ directory for backwards compatibility.
 * The implementation has been split into focused modules for reduced complexity.
 *
 * @see ./avatar/index.ts for the module structure
 */

export {
  type AvatarCandidate,
  copyExternalAvatarToStorage,
  type DownloadedImage,
  maybeCopyIngestionAvatarFromLinks,
  maybeSetProfileAvatarFromLinks,
  type OptimizedAvatar,
} from './avatar/index';
