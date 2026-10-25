// Run: node --test .claude/hooks/pr-create-guard.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { violates } from "./pr-create-guard.mjs";

const HOOK = resolve(import.meta.dirname, "pr-create-guard.mjs");
const run = command =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });

test("raw gh pr create is blocked with the wrapper named", () => {
  for (const command of ["gh pr create --draft --title x", "cd a && gh  pr create -t x", "echo hi; gh pr create"]) {
    assert.equal(violates(command), true, command);
    const done = run(command);
    assert.equal(done.status, 2);
    assert.match(done.stderr, /scripts\/pr-create\.mjs/);
  }
});

test("the wrapper and unrelated gh commands pass", () => {
  for (const command of ["node scripts/pr-create.mjs --draft --title x", "pnpm pr:create --title x", "gh pr view 1", "gh pr edit 1 --body x", "git status"])
    assert.equal(run(command).status, 0, command);
  assert.equal(spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" }).status, 0);
});
