import 'server-only';

/**
 * Instant garment compositing for generated merch art (JOV-2894).
 *
 * Printful photorealistic mockups remain the upgrade path. This engine is the
 * synchronous fallback so the merch card never presents a blank garment as a
 * finished result while provider tasks are in flight or missing a design layer.
 *
 * @see @/lib/merch/artwork — garment templates + Sharp composite
 * @see @/lib/merch/graphic-engine — alpha print graphic source
 */

export {
  createGeneratedMerchArtwork,
  renderMockup,
} from './artwork';
