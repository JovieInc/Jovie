#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  formatM2RevenuePathSummary,
  type M2RevenuePathReceipt,
  normalizeCanaryBaseUrl,
  runM2RevenuePathCanary,
} from '@/lib/canaries/m2-revenue-path';

interface CliOptions {
  readonly baseUrl: string;
  readonly receiptPath?: string;
}

function parseArgValue(
  argv: readonly string[],
  index: number,
  name: string
): { value: string; next: number } | null {
  const arg = argv[index]!;
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) {
    return { value: arg.slice(prefix.length), next: index };
  }
  if (arg === name) {
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} requires a value`);
    return { value, next: index + 1 };
  }
  return null;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let baseUrl = process.env.M2_CANARY_BASE_URL ?? 'https://jov.ie';
  let receiptPath = process.env.M2_CANARY_RECEIPT_PATH;
  for (let index = 0; index < argv.length; index += 1) {
    const base = parseArgValue(argv, index, '--base-url');
    if (base) {
      baseUrl = base.value;
      index = base.next;
      continue;
    }
    const receipt = parseArgValue(argv, index, '--receipt');
    if (receipt) {
      receiptPath = receipt.value;
      index = receipt.next;
    }
  }
  return { baseUrl: normalizeCanaryBaseUrl(baseUrl), receiptPath };
}

function persistReceipt(path: string, receipt: M2RevenuePathReceipt): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const receipt = await runM2RevenuePathCanary({
    baseUrl: options.baseUrl,
  });
  if (options.receiptPath) {
    persistReceipt(options.receiptPath, receipt);
  }
  const summary = formatM2RevenuePathSummary(receipt);
  if (receipt.pass) {
    console.log(summary);
    console.log(JSON.stringify(receipt));
    return;
  }
  console.error(summary);
  console.error(JSON.stringify(receipt));
  console.error(`Repro: ${receipt.repro}`);
  process.exitCode = 1;
}

void main();
