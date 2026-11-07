import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.ts';
import { OAuthStore } from './mcp-oauth.ts';
import { callService, OAuthService } from './mcp-oauth-service.ts';

/** Durable home of the MCP OAuth server state (singleton). All auth state lives here. */
export class McpAuth extends DurableObject<Env> {
  private readonly svc: OAuthService;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.svc = new OAuthService(
      new OAuthStore(ctx.storage.sql),
      () => this.env.MCP_OWNER_TOTP_SECRET
    );
  }

  async call(method: string, args: unknown[]) {
    return callService(this.svc, method, args) as Promise<
      { ok: true; value: never } | { ok: false; status: number; code: string }
    >;
  }
}
