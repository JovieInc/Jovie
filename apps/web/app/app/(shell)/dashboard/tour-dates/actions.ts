/**
 * Tour Dates Actions - Barrel Export
 *
 * This file provides backward compatibility by re-exporting from the modular actions directory.
 * The implementation has been split into focused modules for better maintainability:
 *
 * - actions/types.ts: Type definitions
 * - actions/helpers.ts: Internal helper functions
 * - actions/fetch.ts: Load and query operations
 * - actions/crud.ts: Create, update, delete operations
 * - actions/bandsintown.ts: Bandsintown integration
 *
 * All exports remain the same, so existing imports will continue to work.
 */

export {
  connectBandsintownArtist,
  disconnectBandsintown,
  removeBandsintownApiKey,
  saveBandsintownApiKey,
  syncFromBandsintown,
} from './actions/bandsintown';
export {
  createTourDate,
  deleteTourDate,
  updateTourDate,
} from './actions/crud';
export {
  checkBandsintownConnection,
  loadTourDates,
  loadUpcomingTourDates,
} from './actions/fetch';
export type {
  BandsintownConnectionStatus,
  TicketStatus,
  TourDateViewModel,
} from './actions/types';
