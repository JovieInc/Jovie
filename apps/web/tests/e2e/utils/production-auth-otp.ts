import { neon } from '@neondatabase/serverless';
import { PRODUCTION_AUTH_SMOKE_EMAIL } from './production-auth-credentials';

const OTP_PATTERN = /^\d{6}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_CLOCK_SKEW_MS = 30_000;
const MAX_ALLOWED_ATTEMPTS = 5;

interface ProductionAuthOtpEnvironment {
  readonly DATABASE_URL?: string;
}

export interface ProductionAuthOtpRecord {
  readonly value: string;
  readonly created_at: Date | string;
  readonly expires_at: Date | string;
}

type LoadProductionAuthOtpRecord = (
  email: string,
  startedAtMs: number
) => Promise<ProductionAuthOtpRecord | null>;

function buildSignInVerificationIdentifier(email: string): string {
  return `sign-in-otp-${email.trim().toLowerCase()}`;
}

export function extractProductionAuthOtp(
  record: ProductionAuthOtpRecord,
  startedAtMs: number,
  nowMs = Date.now()
): string | null {
  const createdAtMs = new Date(record.created_at).getTime();
  const expiresAtMs = new Date(record.expires_at).getTime();
  if (
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    createdAtMs < startedAtMs - MAX_CLOCK_SKEW_MS ||
    expiresAtMs <= nowMs
  ) {
    return null;
  }

  const separatorIndex = record.value.lastIndexOf(':');
  if (separatorIndex <= 0) return null;

  const otp = record.value.slice(0, separatorIndex);
  const attempts = record.value.slice(separatorIndex + 1);
  if (
    !OTP_PATTERN.test(otp) ||
    !/^\d+$/.test(attempts) ||
    Number(attempts) >= MAX_ALLOWED_ATTEMPTS
  ) {
    return null;
  }

  return otp;
}

function createProductionAuthOtpLoader(
  environment: ProductionAuthOtpEnvironment
): LoadProductionAuthOtpRecord {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'Production Better Auth OTP retrieval requires DATABASE_URL.'
    );
  }
  const sql = neon(databaseUrl);

  return async (email, startedAtMs) => {
    const identifier = buildSignInVerificationIdentifier(email);
    const freshAfter = new Date(startedAtMs - MAX_CLOCK_SKEW_MS);
    const rows = await sql`
      SELECT value, created_at, expires_at
      FROM ba_verifications
      WHERE identifier = ${identifier}
        AND created_at >= ${freshAfter}
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return (rows[0] as ProductionAuthOtpRecord | undefined) ?? null;
  };
}

export async function waitForProductionAuthOtp({
  email,
  startedAtMs,
  environment = process.env,
  loadRecord,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  readonly email: string;
  readonly startedAtMs: number;
  readonly environment?: ProductionAuthOtpEnvironment;
  readonly loadRecord?: LoadProductionAuthOtpRecord;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== PRODUCTION_AUTH_SMOKE_EMAIL) {
    throw new Error(
      'Production Better Auth OTP retrieval refused a non-smoke identity.'
    );
  }

  const resolvedLoadRecord =
    loadRecord ?? createProductionAuthOtpLoader(environment);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await resolvedLoadRecord(normalizedEmail, startedAtMs);
    if (record) {
      const otp = extractProductionAuthOtp(record, startedAtMs);
      if (otp) return otp;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    'Timed out waiting for a fresh Better Auth production sign-in code.'
  );
}
