import type { Task } from './schedule.ts';

/**
 * Every periodic Cloudflare job registers here instead of owning a cron
 * trigger (canon/schedulers.json, platform `cloudflare`). To adopt a Worker:
 * give it `POST /__cron` (Bearer secret), set `enabled: true`, and remove its
 * own `[triggers] crons` in the same deploy so it never runs twice.
 */
export const TASKS: readonly Task[] = [
  {
    id: 'prod-liveness',
    everyMin: 1,
    url: 'https://jovie-prod-liveness.tim-fd8.workers.dev/__cron',
    secret: 'CRON_SECRET_PROD_LIVENESS',
    enabled: false, // flips with its own cron removal; double runs would halve its time to detect
  },
  {
    id: 'competitor-watch',
    everyMin: 60,
    url: 'https://jovie-competitor-watch.tim-fd8.workers.dev/__cron',
    secret: 'CRON_SECRET_COMPETITOR_WATCH',
    enabled: false, // source in PR #23813; needs /__cron
  },
  {
    id: 'fleet-audit',
    everyMin: 60,
    url: 'https://jovie-fleet-audit.tim-fd8.workers.dev/__cron',
    secret: 'CRON_SECRET_FLEET_AUDIT',
    enabled: false, // workers/observability-ingest; needs /__cron
  },
  {
    id: 'knowledge-ingest',
    everyMin: 1440,
    url: 'https://jovie-knowledge-ingest.tim-fd8.workers.dev/__cron',
    secret: 'CRON_SECRET_KNOWLEDGE_INGEST',
    enabled: false, // not deployed yet
  },
];
