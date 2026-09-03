#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_CONTROLLER_PATH =
  '.github/workflows/production-controller.yml';
export const IN_FLIGHT_CONTROLLER_STATUSES = Object.freeze([
  'in_progress',
  'queued',
  'pending',
  'requested',
  'waiting',
]);

const IN_FLIGHT = new Set(IN_FLIGHT_CONTROLLER_STATUSES);

function exactString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function positiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function classifyInFlightProductionControllerHold(listing) {
  if (!listing || typeof listing !== 'object') {
    return {
      hold: true,
      reason: 'malformed_controller_listing',
      inFlightCount: 0,
      runIds: [],
    };
  }

  const runs = Array.isArray(listing.workflow_runs)
    ? listing.workflow_runs
    : null;
  if (!runs) {
    return {
      hold: true,
      reason: 'malformed_controller_listing',
      inFlightCount: 0,
      runIds: [],
    };
  }

  const inFlight = [];
  for (const run of runs) {
    if (!run || typeof run !== 'object') {
      return {
        hold: true,
        reason: 'malformed_controller_listing',
        inFlightCount: 0,
        runIds: [],
      };
    }
    const path = exactString(run.path);
    const status = exactString(run.status);
    const runId = positiveInteger(run.id);
    if (
      path === PRODUCTION_CONTROLLER_PATH &&
      status &&
      IN_FLIGHT.has(status) &&
      runId
    ) {
      inFlight.push(runId);
    }
  }

  if (inFlight.length > 0) {
    return {
      hold: true,
      reason: 'in_flight_production_controller',
      inFlightCount: inFlight.length,
      runIds: inFlight,
    };
  }

  return {
    hold: false,
    reason: 'no_in_flight_production_controller',
    inFlightCount: 0,
    runIds: [],
  };
}

function parseArgs(argv) {
  const args = { fixture: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--fixture' && value) {
      args.fixture = value;
      index += 1;
    }
  }
  return args;
}

function readListing(fixturePath) {
  if (fixturePath) {
    return JSON.parse(readFileSync(fixturePath, 'utf8'));
  }
  const raw = readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const listing = readListing(args.fixture);
  const result = classifyInFlightProductionControllerHold(listing);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(
      `::error::In-flight Production Controller hold check crashed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}
