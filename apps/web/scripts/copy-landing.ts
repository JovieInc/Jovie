#!/usr/bin/env tsx
/** pnpm copy:landing <spec.json>: run the staged landing pipeline with registry checks. */
import { readFileSync } from 'node:fs';
import { type LandingSpec, runLandingPipeline } from '@jovie/copy';
import { MARKETING_LANDING_CHECKS } from '../data/marketing/landingChecks';

const file = process.argv[2];
if (!file) {
  console.error('usage: pnpm copy:landing <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(file, 'utf8')) as LandingSpec;
const result = runLandingPipeline(spec, MARKETING_LANDING_CHECKS);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
