/**
 * Helicone-routed Vercel AI Gateway client for real-model eval lanes.
 */

import { createGateway } from '@ai-sdk/gateway';

const HELICONE_VERCEL_GATEWAY_BASE_URL = 'https://vercel.helicone.ai/v1/ai';

export function isRealModelEvalEnabled(): boolean {
  return (
    process.env.JOVIE_RUN_REAL_MODEL_EVALS === '1' &&
    Boolean(process.env.AI_GATEWAY_API_KEY) &&
    Boolean(process.env.HELICONE_API_KEY)
  );
}

export function createHeliconeGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const heliconeKey = process.env.HELICONE_API_KEY;

  if (!apiKey) {
    throw new Error('AI_GATEWAY_API_KEY is required for real-model evals');
  }
  if (!heliconeKey) {
    throw new Error('HELICONE_API_KEY is required for real-model evals');
  }

  return createGateway({
    apiKey,
    baseURL: HELICONE_VERCEL_GATEWAY_BASE_URL,
    headers: {
      'Helicone-Auth': `Bearer ${heliconeKey}`,
      'Helicone-Property-Eval-Lane': 'golden-real',
      'Helicone-Property-Branch': process.env.GITHUB_HEAD_REF ?? 'local',
    },
  });
}
