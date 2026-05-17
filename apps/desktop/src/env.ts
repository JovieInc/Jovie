// APP_ENV and APP_URL are baked at build time by scripts/write-env.mjs →
// src/env.generated.ts. They are compile-time constants because process.env is
// undefined inside a packaged Electron binary.
export { APP_ENV, APP_URL } from './env.generated';
