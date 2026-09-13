export { default, metadata } from '@/app/hud/page';

// Next.js route-segment config must be a local literal. Re-exporting
// `dynamic`/`runtime` fails Turbopack: "mustn't be reexported".
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
