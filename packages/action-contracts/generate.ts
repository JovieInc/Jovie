import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { resolvedActionCapabilitySchema } from './descriptor';
import { actionErrorSchema } from './errors';
import { actionInvocationSchema, actionResultSchema } from './invocation';
import { ACTION_MANIFEST, buildDiscoveryDocument } from './manifest';

/**
 * Deterministic generator for the versioned artifacts derived from the
 * canonical manifest:
 *
 *   generated/manifest.json                  — discovery document
 *   generated/openapi.json                   — OpenAPI 3.1 view of the
 *                                              discovery + invoke contract
 *   generated/schemas/<id>.input.json        — domain input (JSON Schema)
 *   generated/schemas/<id>.output.json       — domain output
 *   generated/schemas/<id>.invocation.json   — full invocation envelope
 *   generated/schemas/<id>.result.json       — full result union
 *   generated/schemas/shared.error.json      — stable error shape
 *   generated/schemas/shared.capability.json — discovery item shape
 *
 * `pnpm --filter @jovie/action-contracts run generate` rewrites them;
 * `--check` (and the schema-parity vitest) fails on any drift.
 */

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(PACKAGE_ROOT, 'generated');

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonSchema(schema: z.ZodType, title: string) {
  return {
    title,
    ...z.toJSONSchema(schema, { target: 'draft-2020-12' }),
  };
}

function buildOpenApiDocument() {
  const paths: Record<string, unknown> = {
    '/api/v1/actions': {
      get: {
        operationId: 'resolveActionCapabilities',
        summary: 'Resolve action capabilities',
        description:
          'Authenticated, read-only discovery. Advisory UX only — never authorization; every invocation repeats all checks server-side.',
        parameters: [
          {
            name: 'profileId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Owned creator profile to resolve against.',
          },
          {
            name: 'channel',
            in: 'query',
            required: true,
            schema: { $ref: './manifest.json#/channels' },
          },
          {
            name: 'clientVersion',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Resolved capabilities for every manifest action.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: './schemas/shared.capability.json' },
                },
              },
            },
          },
        },
      },
    },
  };
  for (const action of ACTION_MANIFEST) {
    paths[`/api/v1/actions/${action.id}/invoke`] = {
      post: {
        operationId: `invoke_${action.id.replace('.', '_')}`,
        summary: `Invoke ${action.id}`,
        description:
          'Canonical invocation endpoint. Phase 3 (dispatcher); not implemented in the foundation slice.',
        'x-jovie-phase': 'dispatcher',
        'x-jovie-implemented': false,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `./schemas/${action.id}.invocation.json` },
            },
          },
        },
        responses: {
          '200': {
            description: 'Canonical action result union.',
            content: {
              'application/json': {
                schema: { $ref: `./schemas/${action.id}.result.json` },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Jovie Canonical Actions',
      version: '1.0.0',
      description:
        'Generated from the @jovie/action-contracts manifest. Discovery is live; invoke paths are phase-3 contract definitions.',
    },
    paths,
  };
}

/** Returns the full artifact set as { relativePath: fileContents }. */
export function buildArtifacts(): Record<string, string> {
  const artifacts: Record<string, string> = {
    'manifest.json': serialize(buildDiscoveryDocument()),
    'openapi.json': serialize(buildOpenApiDocument()),
    'schemas/shared.error.json': serialize(
      jsonSchema(actionErrorSchema, 'Canonical action error')
    ),
    'schemas/shared.capability.json': serialize(
      jsonSchema(resolvedActionCapabilitySchema, 'Resolved action capability')
    ),
  };
  for (const action of ACTION_MANIFEST) {
    artifacts[`schemas/${action.id}.input.json`] = serialize(
      jsonSchema(
        action.inputSchema,
        `${action.id} input v${action.schemaVersion}`
      )
    );
    artifacts[`schemas/${action.id}.output.json`] = serialize(
      jsonSchema(
        action.outputSchema,
        `${action.id} output v${action.schemaVersion}`
      )
    );
    artifacts[`schemas/${action.id}.invocation.json`] = serialize(
      jsonSchema(
        actionInvocationSchema(action.inputSchema),
        `${action.id} invocation v${action.schemaVersion}`
      )
    );
    artifacts[`schemas/${action.id}.result.json`] = serialize(
      jsonSchema(
        actionResultSchema(action.outputSchema),
        `${action.id} result v${action.schemaVersion}`
      )
    );
  }
  return artifacts;
}

function writeArtifacts(artifacts: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(artifacts)) {
    const absolutePath = join(GENERATED_DIR, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
}

function checkArtifacts(artifacts: Record<string, string>): string[] {
  const drifted: string[] = [];
  for (const [relativePath, expected] of Object.entries(artifacts)) {
    let actual: string | null = null;
    try {
      actual = readFileSync(join(GENERATED_DIR, relativePath), 'utf8');
    } catch {
      actual = null;
    }
    if (actual !== expected) {
      drifted.push(relativePath);
    }
  }
  return drifted;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const artifacts = buildArtifacts();
  if (process.argv.includes('--check')) {
    const drifted = checkArtifacts(artifacts);
    if (drifted.length > 0) {
      console.error(
        `Generated artifacts are stale: ${drifted.join(', ')}\n` +
          'Run: pnpm --filter @jovie/action-contracts run generate'
      );
      process.exit(1);
    }
    console.log('Generated artifacts are up to date.');
  } else {
    writeArtifacts(artifacts);
    console.log(`Wrote ${Object.keys(artifacts).length} artifacts.`);
  }
}
