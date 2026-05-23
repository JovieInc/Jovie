#!/usr/bin/env tsx
import { generateBrandAssets } from '../apps/web/scripts/generate-brand-assets';

generateBrandAssets().catch(error => {
  console.error(error);
  process.exit(1);
});
