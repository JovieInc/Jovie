import { describe, expect, it } from 'vitest';
import {
  assessDatabaseTarget,
  isProductionDatabaseTarget,
} from './seed-database-guard';

describe('seed-database-guard', () => {
  it('treats Doppler prd config as production', () => {
    const assessment = assessDatabaseTarget({
      DATABASE_URL: 'neon-dev-url',
      DOPPLER_CONFIG: 'prd',
    });

    expect(assessment.target).toBe('production');
    expect(assessment.reasons).toContain('DOPPLER_CONFIG=prd');
  });

  it('treats matching DATABASE_URL_MAIN as production', () => {
    const url = 'neon-main-branch-url';

    const assessment = assessDatabaseTarget({
      DATABASE_URL: url,
      DATABASE_URL_MAIN: url,
    });

    expect(assessment.target).toBe('production');
    expect(assessment.reasons).toContain(
      'DATABASE_URL matches DATABASE_URL_MAIN'
    );
  });

  it('allows dev databases without production signals', () => {
    const assessment = assessDatabaseTarget({
      DATABASE_URL: 'neon-dev-branch-url',
      DOPPLER_CONFIG: 'dev',
      VERCEL_ENV: 'development',
    });

    expect(assessment.target).toBe('non-production');
    expect(
      isProductionDatabaseTarget({
        DATABASE_URL: 'neon-dev-branch-url',
        DOPPLER_CONFIG: 'dev',
      })
    ).toBe(false);
  });

  it('flags production DATABASE_URL substrings', () => {
    const assessment = assessDatabaseTarget({
      DATABASE_URL: 'neon-endpoint-production-branch',
    });

    expect(assessment.target).toBe('production');
    expect(assessment.reasons).toContain('DATABASE_URL contains "production"');
  });
});
