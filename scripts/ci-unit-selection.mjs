import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// run_web is a broad product lane (it includes Ovie/CLI). Preserve every
// affected task, but explicitly run web when Turbo cannot select it. This
// conservative fallback covers unknown dependency edges without rejecting
// legitimate sibling-only changes or treating a zero-task exit as evidence.
export function selectedWebUnitMode(plan, { requireWeb = false } = {}) {
  if (!Array.isArray(plan?.tasks)) throw new Error('Missing Turbo task plan');
  if (plan.tasks.some(task => !task || typeof task.taskId !== 'string')) {
    throw new Error('Malformed Turbo task plan');
  }
  const tasks = plan.tasks.filter(
    task => task?.taskId === '@jovie/web#test:fast'
  );
  if (tasks.length === 0 && !requireWeb) return 'affected-and-web';
  const task = tasks[0];
  if (
    tasks.length !== 1 ||
    task.package !== '@jovie/web' ||
    task.task !== 'test:fast' ||
    typeof task.command !== 'string' ||
    !task.command.trim() ||
    task.command === '<NONEXISTENT>'
  ) {
    throw new Error(
      'Selected web unit lane has no unique executable @jovie/web#test:fast task'
    );
  }
  return 'affected';
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const mode = selectedWebUnitMode(JSON.parse(readFileSync(0, 'utf8')), {
      requireWeb: process.argv.includes('--require-web'),
    });
    console.log(mode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
