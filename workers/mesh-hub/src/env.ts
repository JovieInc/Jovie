import type { Board } from './board-do.ts';
import type { Mailbox } from './mailbox.ts';
import type { Registry } from './registry.ts';

export type Env = {
  MAILBOX: DurableObjectNamespace<Mailbox>;
  REGISTRY: DurableObjectNamespace<Registry>;
  BOARD: DurableObjectNamespace<Board>;
  /** Registry writes only. Lives in Doppler agent-mesh/prd, never on agent hosts. */
  HUB_ADMIN_TOKEN: string;
  /** Unset until summer-config consumes /summer/v1/mesh/hub. */
  SUMMER_HUB_WEBHOOK_URL?: string;
  SUMMER_HUB_WEBHOOK_SECRET?: string;
  /** Optional out-of-band alert sink (JSON POST), for alarms about Summer itself. */
  ALERT_WEBHOOK_URL?: string;
  /** Comma-separated kinds that also receive alarm events (default "claude,codex"). */
  ALERT_KINDS?: string;
  /** Cloudflare Workers AI binding (no secret): the hub model executor. */
  AI?: Ai;
  /** Kinds the hub executes for when no live reader handles their mail. */
  EXECUTOR_KINDS?: string;
  /** How long a real reader gets before the executor takes a message (ms). */
  EXECUTOR_GRACE_MS?: string;
  /** Unhandled-mail alarm threshold in ms (default 600000, min 60000). */
  MAIL_STALE_MS?: string;
};
