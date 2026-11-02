import type { Mailbox } from './mailbox.ts';
import type { Registry } from './registry.ts';

export type Env = {
  MAILBOX: DurableObjectNamespace<Mailbox>;
  REGISTRY: DurableObjectNamespace<Registry>;
  /** Registry writes only. Lives in Doppler agent-mesh/prd, never on agent hosts. */
  HUB_ADMIN_TOKEN: string;
  /** Unset until summer-config consumes /summer/v1/mesh/hub. */
  SUMMER_HUB_WEBHOOK_URL?: string;
  SUMMER_HUB_WEBHOOK_SECRET?: string;
  /** Optional out-of-band alert sink (JSON POST), for alarms about Summer itself. */
  ALERT_WEBHOOK_URL?: string;
  /** Comma-separated kinds that also receive alarm events (default "claude,codex"). */
  ALERT_KINDS?: string;
};
