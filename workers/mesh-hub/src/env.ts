import type { Board } from './board-do.ts';
import type { Mailbox } from './mailbox.ts';
import type { McpAuth } from './mcp-oauth-do.ts';
import type { Registry } from './registry.ts';

export type Env = {
  MAILBOX: DurableObjectNamespace<Mailbox>;
  REGISTRY: DurableObjectNamespace<Registry>;
  BOARD: DurableObjectNamespace<Board>;
  MCP_AUTH: DurableObjectNamespace<McpAuth>;
  /** Base32 TOTP secret of the hub owner (Tim). Unset means no MCP consent can ever succeed. */
  MCP_OWNER_TOTP_SECRET?: string;
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
  /** Vercel Board shadow-mirror receiver URL (pilot). Unset = mirror off. */
  BOARD_MIRROR_URL?: string;
  /** HMAC secret for the Board mirror receiver. Unset = off. Lives in Doppler agent-mesh/prd. */
  BOARD_MIRROR_SECRET?: string;
  /** "1" also mirrors task bodies (2000 chars) and results/notes/answers (500), not just titles. */
  BOARD_MIRROR_BODY?: string;
};
