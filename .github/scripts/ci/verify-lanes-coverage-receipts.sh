#!/usr/bin/env bash
node --input-type=module <<'NODE'
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { LANES_COVERAGE_GROUP_SHARDS, lanesReceiptRanSuite } from './scripts/lib/ci-structural-shards.mjs';
const ran = Object.keys(LANES_COVERAGE_GROUP_SHARDS).map(group => {
  const dir = `${process.env.RUNNER_TEMP}/lanes-coverage/${group}`;
  const executed = lanesReceiptRanSuite(JSON.parse(readFileSync(`${dir}/receipt.json`, 'utf8')));
  if (executed && !existsSync(`${dir}/jovie-lanes-${group}.coverage`)) {
    throw new Error(`Missing lanes coverage data: ${group}`);
  }
  return executed;
});
if (ran.some(value => value !== ran[0])) throw new Error('Inconsistent lanes coverage receipts');
appendFileSync(process.env.GITHUB_OUTPUT, `ran=${ran[0]}\n`);
NODE
