// Next.js middleware entry point.
// All logic lives in proxy.ts; this file simply re-exports so that
// Next.js discovers it under the required conventional filename.
export { default, config } from './proxy';
