/**
 * Intent Router
 * Routes classified intents to the appropriate CRUD handler.
 */

import type { DetectedIntent } from '../types';
import { HANDLER_REGISTRY } from './registry';
import type { CRUDResult, HandlerContext } from './types';

/**
 * Route a detected intent to its handler and return the result.
 * Returns null if no handler is registered for the intent category.
 */
export async function routeIntent(
  intent: DetectedIntent,
  context: HandlerContext
): Promise<CRUDResult | null> {
  const handler = HANDLER_REGISTRY[intent.category];
  if (!handler) {
    return null;
  }

  return handler.handle(intent, context);
}
