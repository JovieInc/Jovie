#!/usr/bin/env node
import { evaluatePromotionReceipt } from './lib/rolling-ci-learning.mjs';

/** @typedef {AsyncIterable<Buffer | string>} PromotionStdin */
/** @typedef {{ write: (chunk: string) => unknown }} PromotionStdout */

/**
 * @param {PromotionStdin} [stream]
 */
export async function readPromotionReceiptInput(stream) {
  const source = stream ?? process.stdin;
  const chunks = [];
  for await (const chunk of source) chunks.push(chunk);
  const raw = Buffer.concat(
    chunks.map(chunk => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
  ).toString('utf8');
  return JSON.parse(raw || '{}');
}

/**
 * @param {{
 *   complete?: boolean,
 *   requiredReceipts?: number,
 *   acceptedReceipts?: number,
 *   blockers?: unknown[],
 * }} result
 */
export function renderPromotionReceiptResult(result) {
  return `${JSON.stringify({
    complete: result.complete,
    requiredReceipts: result.requiredReceipts,
    acceptedReceipts: result.acceptedReceipts,
    blockers: result.blockers,
    reason: result.complete
      ? null
      : 'exact-head learning receipt required for repaired failures',
  })}\n`;
}

/**
 * @param {{ stdin?: PromotionStdin, stdout?: PromotionStdout }} [io]
 */
export async function runPromotionReceiptCli(io = {}) {
  const stdin = io.stdin ?? process.stdin;
  const stdout = io.stdout ?? process.stdout;
  const input = await readPromotionReceiptInput(stdin);
  const result = evaluatePromotionReceipt(input);
  stdout.write(renderPromotionReceiptResult(result));
  return result.complete ? 0 : 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runPromotionReceiptCli()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 2;
    });
}
