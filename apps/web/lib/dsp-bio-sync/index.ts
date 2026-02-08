/**
 * DSP Bio Sync Module
 *
 * Handles pushing artist bio updates to Digital Service Providers (DSPs).
 * Supports both API-based and email-based update methods.
 */

export type { BioSyncMethod, DspBioProvider } from './providers';
export {
  DSP_BIO_PROVIDERS,
  getApiBioProviders,
  getBioProvider,
  getEmailBioProviders,
  getEnabledBioProviders,
  isBioSyncSupported,
} from './providers';
export type {
  BioSyncRequest,
  BioSyncResponse,
  BioSyncResult,
} from './service';
export { getBioSyncStatus, syncBioToDsps } from './service';
