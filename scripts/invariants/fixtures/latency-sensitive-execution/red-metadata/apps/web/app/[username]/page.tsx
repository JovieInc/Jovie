import { readFileSync } from 'node:fs';

// Check class: thread-blocking. generateMetadata is request-path.
// Route-response-latency (bot/crawler wait) is a separate check.
export async function generateMetadata() {
  const raw = readFileSync('/tmp/profile.json', 'utf8');
  return { title: raw };
}
