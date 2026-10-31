/**
 * Secrets metadata lint (pure functions; JOV-7998 audit, 2026-10-25).
 *
 * Inputs are metadata only: key names, record types, targets, token ages. No
 * value ever enters or leaves these functions. Callers (scripts/secrets-
 * metadata-lint.mjs) collect the metadata from Vercel, GitHub and Doppler.
 *
 * Rules
 *   public-config-typed-secret  NEXT_PUBLIC_* stored as a Vercel Secret/Sensitive
 *                               record. Public config is inlined at build time;
 *                               LYB production deploys failed from 2026-10-23
 *                               after exactly this. ERROR for new keys, WARN for
 *                               the baselined ones.
 *   secret-readable             secret-looking key stored readable (legacy
 *                               "encrypted"/plain) in production. WARN.
 *   environment-drift           GitHub environment holds names outside its
 *                               manifest. WARN (report) until the shrink lands.
 *   environment-ungated         GitHub environment with no deployment branch
 *                               policy. WARN.
 *   token-no-expiry             Doppler service token without expiry. WARN.
 *   token-old                   Token or secret older than the max age. WARN.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET_LOOKING =
  /(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|DATABASE_URL|ENCRYPTION|SIGNING|WEBHOOK)/;

const finding = (rule, severity, subject, message) => ({
  rule,
  severity,
  subject,
  message,
});

/**
 * @param {{key:string,type:string,target?:string[]}[]} records Vercel env records
 * @param {{project:string,baselinePublicSecretKeys?:string[]}} opts
 */
export function lintVercelEnv(
  records,
  { project, baselinePublicSecretKeys = [] }
) {
  const baseline = new Set(baselinePublicSecretKeys);
  const out = [];
  const seenPublic = new Set();
  const seenReadable = new Set();
  for (const r of records) {
    const subject = `vercel:${project}:${r.key}`;
    if (r.key.startsWith('NEXT_PUBLIC_') && r.type === 'sensitive') {
      if (seenPublic.has(r.key)) continue;
      seenPublic.add(r.key);
      out.push(
        finding(
          'public-config-typed-secret',
          baseline.has(r.key) ? 'warn' : 'error',
          subject,
          baseline.has(r.key)
            ? 'baselined: store NEXT_PUBLIC_* as Config (readable), not Secret'
            : 'NEW: NEXT_PUBLIC_* must be a Config (readable) variable; Secret values are not available to local/prebuilt builds'
        )
      );
    } else if (
      !r.key.startsWith('NEXT_PUBLIC_') &&
      r.type !== 'sensitive' &&
      (r.target ?? []).includes('production') &&
      SECRET_LOOKING.test(r.key) &&
      !seenReadable.has(r.key)
    ) {
      seenReadable.add(r.key);
      out.push(
        finding(
          'secret-readable',
          'warn',
          subject,
          'secret-looking key is readable in production; store it as a Secret'
        )
      );
    }
  }
  return out;
}

/**
 * @param {{environment:string,secretNames:string[],manifestNames:string[],hasBranchPolicy:boolean}} env
 */
export function lintGithubEnvironment(env) {
  const out = [];
  const allowed = new Set([...env.manifestNames, 'GITHUB_TOKEN']);
  const extra = env.secretNames.filter(n => !allowed.has(n));
  if (extra.length > 0) {
    out.push(
      finding(
        'environment-drift',
        'warn',
        `github-env:${env.environment}`,
        `${extra.length} secret names outside the manifest (${env.secretNames.length} present, ${env.manifestNames.length} allowed)`
      )
    );
  }
  if (!env.hasBranchPolicy) {
    out.push(
      finding(
        'environment-ungated',
        'warn',
        `github-env:${env.environment}`,
        'no deployment branch policy; any ref can read the environment secrets'
      )
    );
  }
  return out;
}

/**
 * @param {{name:string,createdAt:string,expiresAt?:string|null}[]} tokens
 */
export function lintTokenAges(
  tokens,
  { nowMs, maxAgeDays = 90, subjectPrefix = 'token' }
) {
  const out = [];
  for (const t of tokens) {
    const subject = `${subjectPrefix}:${t.name}`;
    if (!t.expiresAt) {
      out.push(
        finding(
          'token-no-expiry',
          'warn',
          subject,
          'token has no expiry; prefer OIDC or a dated token'
        )
      );
    }
    const age = (nowMs - Date.parse(t.createdAt)) / DAY_MS;
    if (Number.isFinite(age) && age > maxAgeDays) {
      out.push(
        finding(
          'token-old',
          'warn',
          subject,
          `created ${Math.floor(age)} days ago (max ${maxAgeDays})`
        )
      );
    }
  }
  return out;
}

export function summarize(findings) {
  return {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warn').length,
  };
}
