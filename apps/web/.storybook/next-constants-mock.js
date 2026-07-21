// Mock for `next/constants` in the Storybook browser bundle.
//
// The real module (next/dist/esm/shared/lib/constants) evaluates
// `process?.features?.typescript` at module top level, which throws
// `ReferenceError: process is not defined` in a plain browser (Chromatic
// story extraction). The only browser-bundle consumer is @sentry/nextjs'
// isBuild util, which needs PHASE_PRODUCTION_BUILD; the other PHASE_* values
// are exported to match the real module's public surface.

export const PHASE_EXPORT = 'phase-export';
export const PHASE_ANALYZE = 'phase-analyze';
export const PHASE_PRODUCTION_BUILD = 'phase-production-build';
export const PHASE_PRODUCTION_SERVER = 'phase-production-server';
export const PHASE_DEVELOPMENT_SERVER = 'phase-development-server';
export const PHASE_TEST = 'phase-test';
export const PHASE_INFO = 'phase-info';
