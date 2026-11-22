import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const DESIGN_REFS_INTAKE_SCHEMA = 'jovie.design-refs-intake/v1';

const ViewportSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    suffix: z.string().min(1).max(40),
  })
  .strict();

export const DesignRefsIntakeConfigSchema = z
  .object({
    schema: z.literal(DESIGN_REFS_INTAKE_SCHEMA),
    scheduledEnabledDefault: z.boolean(),
    spendCap: z
      .object({
        maxBrowserCapturesPerRun: z.number().int().positive(),
        maxEstimatedUsdPerRun: z.number().nonnegative(),
        estimatedUsdPerBrowserCapture: z.number().nonnegative(),
        note: z.string().min(1),
      })
      .strict(),
    minReferencesPerSurface: z.number().int().positive(),
    colorScheme: z.enum(['dark', 'light', 'no-preference']),
    viewports: z
      .object({
        desktop: ViewportSchema,
        mobile: ViewportSchema,
      })
      .strict(),
    surfaceAliases: z.record(z.string(), z.array(z.string())),
    surfaces: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(120),
            pageTypes: z.array(z.string().min(1)).min(1),
          })
          .strict()
      )
      .min(1),
    jovieStagingOrigin: z.string().url(),
    jovieStagingPaths: z.array(
      z
        .object({
          path: z.string().min(1),
          surfaces: z.array(z.string().min(1)).min(1),
          variable: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();

export type DesignRefsIntakeConfig = z.infer<
  typeof DesignRefsIntakeConfigSchema
>;

export const INTAKE_SURFACE_IDS = [
  'homepage',
  'artist-profile-release',
  'onboarding-start',
  'app-shell',
  'chat',
  'marketing-icp',
] as const;

export type IntakeSurfaceId = (typeof INTAKE_SURFACE_IDS)[number];

export function intakeConfigPath(designRefsDir: string): string {
  return join(designRefsDir, 'intake-config.json');
}

export function parseDesignRefsIntakeConfig(
  raw: string
): DesignRefsIntakeConfig {
  return DesignRefsIntakeConfigSchema.parse(JSON.parse(raw));
}

export async function loadDesignRefsIntakeConfig(
  designRefsDir: string
): Promise<DesignRefsIntakeConfig> {
  const raw = await readFile(intakeConfigPath(designRefsDir), 'utf8');
  return parseDesignRefsIntakeConfig(raw);
}

export function expandSurfaceTags(
  config: DesignRefsIntakeConfig,
  surface: string
): Set<string> {
  const normalized = surface.toLowerCase();
  const tags = new Set<string>([normalized]);
  for (const [canonical, aliases] of Object.entries(config.surfaceAliases)) {
    if (canonical === normalized || aliases.includes(normalized)) {
      tags.add(canonical);
      for (const alias of aliases) tags.add(alias);
    }
  }
  for (const entry of config.surfaces) {
    if (entry.id === normalized || entry.pageTypes.includes(normalized)) {
      tags.add(entry.id);
      for (const pageType of entry.pageTypes) tags.add(pageType);
    }
  }
  return tags;
}

export function isScheduledIntakeEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const flag = env.DESIGN_REFS_SCHEDULED_ENABLED?.trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return false;
}
