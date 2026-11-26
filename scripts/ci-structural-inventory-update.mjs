#!/usr/bin/env node
// Update a structural inventory entry only after measuring its current command.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function structuralCommands(source) {
  const commands = [];
  for (const part of ['operationsParts', 'webParts']) {
    const start = source.indexOf(`  const ${part} = [`);
    const end = source.indexOf('\n  ];', start);
    if (start < 0 || end < 0) throw new Error(`Missing ${part}`);
    for (const match of source
      .slice(start, end)
      .matchAll(/^ {4}'((?:[^'\\]|\\.)*)',?\s*$/gmu)) {
      commands.push({ part, command: match[1].replaceAll("\\'", "'") });
    }
  }
  return commands;
}

export function updateInventory(inventory, commands, oldKey, match, measure) {
  const entries = inventory.commands.filter(row => row.key === oldKey);
  const candidates = commands.filter(row => row.command.includes(match));
  if (!oldKey || entries.length !== 1 || !match || candidates.length !== 1)
    throw new Error('Expected one inventory entry and one matching command');
  const entry = entries[0];
  const candidate = candidates[0];
  const key = candidate.command.slice(0, 120);
  if (
    entry.part !== candidate.part ||
    inventory.commands.some(row => row !== entry && row.key === key)
  )
    throw new Error('Part mismatch or inventory key collision');
  const seconds = measure(candidate.command);
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error('Invalid measurement');
  if (
    (entry.kind === 'pr-cheap-scan' && seconds >= inventory.thresholdSeconds) ||
    (entry.kind === 'expensive-merge-group-only' &&
      seconds < inventory.thresholdSeconds)
  )
    throw new Error(
      'Measured time conflicts with classification; review it manually'
    );
  entry.key = key;
  entry.seconds = seconds;
  return inventory;
}

export function replaceInventoryEntry(source, oldKey, entry) {
  const marker = `"key": ${JSON.stringify(oldKey)}`;
  const start = source.indexOf(marker);
  const end = source.indexOf('\n    }', start);
  if (
    start < 0 ||
    end < 0 ||
    source.indexOf(marker, start + marker.length) >= 0
  )
    throw new Error('Cannot locate a unique formatted inventory entry');
  const block = source.slice(start, end);
  const updated = block
    .replace(marker, `"key": ${JSON.stringify(entry.key)}`)
    .replace(/"seconds":\s*\d+(?:\.\d+)?/u, `"seconds": ${entry.seconds}`);
  if (
    !block.includes('"seconds":') ||
    !updated.includes(`"seconds": ${entry.seconds}`)
  )
    throw new Error('Cannot update the inventory measurement');
  return source.slice(0, start) + updated + source.slice(end);
}

function main() {
  const [oldKey, match] = process.argv.slice(2);
  if (process.argv.length !== 4)
    throw new Error(
      'Usage: node scripts/ci-structural-inventory-update.mjs <old-key> <unique-command-substring>'
    );
  const inventoryPath = fileURLToPath(
    new URL('./ci-structural-inventory.json', import.meta.url)
  );
  const source = readFileSync(
    new URL('./ci-fast-lanes.mjs', import.meta.url),
    'utf8'
  );
  const original = readFileSync(inventoryPath, 'utf8');
  const inventory = JSON.parse(original);
  const entry = inventory.commands.find(row => row.key === oldKey);
  updateInventory(
    inventory,
    structuralCommands(source),
    oldKey,
    match,
    command => {
      const start = process.hrtime.bigint();
      const result = spawnSync(command, { shell: true, stdio: 'inherit' });
      if (result.error || result.status !== 0)
        throw new Error('Command failed; inventory unchanged');
      return Math.round(Number(process.hrtime.bigint() - start) / 1e7) / 100;
    }
  );
  writeFileSync(inventoryPath, replaceInventoryEntry(original, oldKey, entry));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
