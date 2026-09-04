/**
 * Canonical filesystem paths for Hermes-Air. Centralized so jobs and
 * the bootstrap agree on where state lives.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export const HERMES_HOME =
  process.env.HERMES_HOME ?? join(homedir(), '.hermes');

export const HERMES_PATHS = {
  home: HERMES_HOME,
  config: join(HERMES_HOME, 'config.yaml'),
  env: join(HERMES_HOME, '.env'),
  logsDir: join(HERMES_HOME, 'logs'),
  stateDir: join(HERMES_HOME, 'state'),
  daemonLog: join(HERMES_HOME, 'logs', 'daemon.log'),
  jobsLog: join(HERMES_HOME, 'logs', 'jobs.jsonl'),
  voiceMemoLog: join(HERMES_HOME, 'logs', 'voice-memo.jsonl'),
  dispatchLog: join(HERMES_HOME, 'logs', 'dispatch.jsonl'),
  costLog: join(HERMES_HOME, 'logs', 'cost.jsonl'),
  voiceMemosSeen: join(HERMES_HOME, 'state', 'voice-memos-seen.json'),
  heavyJobLock: join(HERMES_HOME, 'state', 'heavy-job.lock'),
  modelRankings: join(HERMES_HOME, 'state', 'model-router-rankings.json'),
  linearQueue: join(HERMES_HOME, 'state', 'linear-queue.jsonl'),
  trackerQueue: join(HERMES_HOME, 'state', 'tracker-queue.jsonl'),
  telegramChatId: join(HERMES_HOME, 'state', 'telegram-chat-id'),
} as const;

export const AGENTCOOKIE_STATE_DIR = join(HERMES_HOME, 'state', 'agentcookie');
export const AGENTCOOKIE_COOKIES_DIR = join(HERMES_HOME, 'cookies');

export const VOICE_MEMOS_RECORDINGS =
  process.env.HERMES_VOICE_MEMOS_DIR ??
  join(
    homedir(),
    'Library',
    'Group Containers',
    'group.com.apple.VoiceMemos.shared',
    'Recordings'
  );
