#!/usr/bin/env npx tsx
/**
 * Build-time environment validation script (ENG-004)
 *
 * Validates that critical environment variables are present before deploy.
 * Run during build to fail fast on critical misconfigurations.
 *
 * Usage: npx tsx scripts/validate-env.ts
 *
 * Exit codes:
 *   0 - All critical checks passed
 *   1 - Critical environment issues detected (deploy should fail)
 */

// MVP-critical environment variables
const CRITICAL_VARS = [
  {
    key: 'DATABASE_URL',
    label: 'Database',
    validate: (v: string) => v.startsWith('postgres'),
  },
  {
    key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    label: 'Auth (Clerk)',
    validate: (v: string) => v.startsWith('pk_'),
  },
  {
    key: 'CLERK_SECRET_KEY',
    label: 'Auth Secret',
    validate: (v: string) => v.startsWith('sk_'),
  },
] as const;

// Important but not critical for MVP launch
const IMPORTANT_VARS = [
  { key: 'NEXT_PUBLIC_APP_URL', label: 'App URL' },
  { key: 'STATSIG_SERVER_API_KEY', label: 'Feature Flags (Statsig)' },
] as const;

// Production-only requirements
const PRODUCTION_VARS = [
  {
    key: 'URL_ENCRYPTION_KEY',
    label: 'URL Encryption',
    validate: (v: string) => v !== 'default-key-change-in-production-32-chars',
  },
] as const;

interface ValidationResult {
  key: string;
  label: string;
  present: boolean;
  valid: boolean;
  error?: string;
}

function validateVar(
  key: string,
  label: string,
  validate?: (v: string) => boolean
): ValidationResult {
  const value = process.env[key];

  if (!value) {
    return { key, label, present: false, valid: false };
  }

  if (validate && !validate(value)) {
    return {
      key,
      label,
      present: true,
      valid: false,
      error: 'Invalid format',
    };
  }

  return { key, label, present: true, valid: true };
}

async function main() {
  console.log('[validate-env] Running pre-deploy environment validation...\n');

  const isProduction = process.env.VERCEL_ENV === 'production';
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

  console.log(`[validate-env] Environment: ${env}`);
  console.log(`[validate-env] Production mode: ${isProduction}`);
  console.log('');

  // Validate critical variables
  console.log('[validate-env] Checking critical variables...');
  const criticalResults = CRITICAL_VARS.map(v =>
    validateVar(v.key, v.label, v.validate)
  );

  const criticalMissing = criticalResults.filter(r => !r.present);
  const criticalInvalid = criticalResults.filter(r => r.present && !r.valid);

  criticalResults.forEach(r => {
    if (!r.present) {
      console.error(`  ❌ ${r.label} (${r.key}): MISSING`);
    } else if (!r.valid) {
      console.error(`  ❌ ${r.label} (${r.key}): ${r.error || 'INVALID'}`);
    } else {
      console.log(`  ✅ ${r.label}`);
    }
  });

  // Validate important variables (warnings only)
  console.log('\n[validate-env] Checking important variables...');
  const importantResults = IMPORTANT_VARS.map(v => validateVar(v.key, v.label));

  importantResults.forEach(r => {
    if (!r.present) {
      console.warn(`  ⚠️  ${r.label} (${r.key}): not set`);
    } else {
      console.log(`  ✅ ${r.label}`);
    }
  });

  // Validate production-only variables
  if (isProduction || isPreview) {
    console.log('\n[validate-env] Checking production requirements...');
    const productionResults = PRODUCTION_VARS.map(v =>
      validateVar(v.key, v.label, v.validate)
    );

    productionResults.forEach(r => {
      if (!r.present) {
        console.error(
          `  ❌ ${r.label} (${r.key}): MISSING (required in ${env})`
        );
        criticalMissing.push(r);
      } else if (!r.valid) {
        console.error(`  ❌ ${r.label} (${r.key}): ${r.error || 'INVALID'}`);
        criticalInvalid.push(r);
      } else {
        console.log(`  ✅ ${r.label}`);
      }
    });
  }

  // Summary
  console.log('\n' + '='.repeat(60));

  const totalCriticalIssues = criticalMissing.length + criticalInvalid.length;

  if (totalCriticalIssues > 0) {
    console.error(
      `[validate-env] ❌ VALIDATION FAILED: ${totalCriticalIssues} critical issue(s)`
    );

    if (criticalMissing.length > 0) {
      console.error('\nMissing critical variables:');
      criticalMissing.forEach(r => console.error(`  - ${r.label} (${r.key})`));
    }

    if (criticalInvalid.length > 0) {
      console.error('\nInvalid critical variables:');
      criticalInvalid.forEach(r =>
        console.error(`  - ${r.label} (${r.key}): ${r.error}`)
      );
    }

    console.error('\n[validate-env] Deploy blocked due to critical issues.');
    console.error(
      '[validate-env] Please set the required environment variables in Doppler or Vercel.'
    );
    process.exit(1);
  }

  console.log('[validate-env] ✅ Environment validation passed.');
  console.log('[validate-env] All critical variables are present and valid.');
  process.exit(0);
}

main().catch(err => {
  console.error('[validate-env] Validation script crashed:', err);
  process.exit(1);
});
