// APP_ENV is baked at build time by scripts/write-env.mjs → src/env.generated.ts.
// This file is re-generated before every dev/build run so it always reflects the
// intended target environment as a compile-time constant, rather than a runtime
// process.env read (which is undefined inside a packaged Electron binary).
import { APP_ENV } from './env.generated';

export { APP_ENV };

export const APP_URL =
  APP_ENV === 'staging' ? 'https://staging.app.jov.ie' : 'https://jov.ie';
