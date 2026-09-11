import { existsSync } from 'node:fs';

// existsSync is gray. Module top-level config-once is an allowed exception.
// Prefer async or precompute; do not treat this as a route-latency fix.
export const HAS_LOCAL_CONFIG = existsSync('/tmp/jovie-config.json');
