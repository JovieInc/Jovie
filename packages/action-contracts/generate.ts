import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';
import { ACTION_MANIFEST, buildDiscoveryDocument } from './manifest';
import { ACTION_CONTRACT_VERSION } from './metadata';

/**
 * Deterministic generator for the versioned artifacts derived from the
 * canonical manifest:
 *
 *   generated/manifest.json          — discovery document
 *   generated/schemas/<id>.*.json    — JSON Schema (draft 2020-12) per action
 *   generated/openapi.json           — contract-only OpenAPI 3.1 document
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
  const paths: Record<string, unknown> = {};
  for (const action of ACTION_MANIFEST) {
    paths[`/actions/${action.id}`] = {
      post: {
        operationId: action.id.replace('.', '_'),
        summary: action.discovery.title,
        description: `${action.discovery.summary} Contract-only definition; no runtime route exists at this path yet.`,
        'x-jovie-action-version': action.version,
        'x-jovie-contract-only': true,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `./schemas/${action.id}.input.json` },
            },
          },
        },
        responses: {
          '200': {
            description: 'Canonical action result envelope.',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: `./schemas/${action.id}.output.json` },
                    { $ref: `./schemas/${action.id}.error.json` },
                  ],
                },
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
      title: 'Jovie Canonical Actions (contract only)',
      version: ACTION_CONTRACT_VERSION,
      description:
        'Contract-only view of the canonical actions manifest. These paths are not served by any runtime; they exist so Swift, MCP, and CLI bindings can be generated against a stable OpenAPI artifact.',
    },
    paths,
  };
}

/** Returns the full artifact set as { relativePath: fileContents }. */
export function buildArtifacts(): Record<string, string> {
  const artifacts: Record<string, string> = {
    'manifest.json': serialize(buildDiscoveryDocument()),
    'openapi.json': serialize(buildOpenApiDocument()),
  };
  for (const action of ACTION_MANIFEST) {
    artifacts[`schemas/${action.id}.input.json`] = serialize(
      jsonSchema(action.input, `${action.id} input v${action.version}`)
    );
    artifacts[`schemas/${action.id}.output.json`] = serialize(
      jsonSchema(action.output, `${action.id} output v${action.version}`)
    );
    artifacts[`schemas/${action.id}.error.json`] = serialize(
      jsonSchema(action.error, `${action.id} error v${action.version}`)
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
