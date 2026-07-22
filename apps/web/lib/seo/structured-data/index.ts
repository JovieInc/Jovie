export {
  resolveArtistEntityType,
  resolveMusicContentSchemaType,
} from './artist-entity';
export { formatSchemaEventStartDate } from './event-date';
export {
  generateMerchStructuredData,
  type MerchAggregateRatingInput,
  type MerchStructuredDataInput,
} from './merch';
export { generateMusicStructuredData } from './music';
export {
  generateProfileStructuredData,
  MAX_ENTITY_MENTIONS,
  MAX_EVENT_SCHEMAS,
  type ProfileEntityMention,
} from './profile';
export {
  validateMerchRichResults,
  validateMusicRichResults,
  validateProfileRichResults,
} from './validate';
