import { DSP_REGISTRY, STREAMING_DSP_KEYS } from '@/lib/dsp-registry';

/**
 * Derived coverage counts for copy and claims. Never hard-code these numbers
 * in marketing or content: import them so they follow DSP_REGISTRY.
 */
export const LISTEN_SERVICE_COUNT = STREAMING_DSP_KEYS.length;
export const RECOGNISED_SERVICE_COUNT = DSP_REGISTRY.length;
