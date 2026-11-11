import { expect } from 'vitest';

// Keep the coverage assertions shared and below the test file size ratchet.
export function assertLaneCoverageFloors(command, structuralCommands) {
  // Every per-module coverage floor still runs, after the shards combine.
  expect(command).toContain('coverage combine');
  expect(command.match(/--fail-under=/g)?.length).toBe(23);
  expect(command).toContain(
    'cloud_lane*.py,*/scripts/lanes/codex_cloud_*.py,*/scripts/lanes/codex_slot_lease.py" --fail-under=90'
  );
  expect(command).toContain('priority_admission.py" --fail-under=80');
  expect(command).toContain('board_intake.py" --fail-under=85');
  expect(structuralCommands[0]).toBe(command);
}
