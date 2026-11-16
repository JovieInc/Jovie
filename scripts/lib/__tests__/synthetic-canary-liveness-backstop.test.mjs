// Missed-slot backstop coverage for synthetic-canary-liveness.mjs (JOV-6813):
// additive file so the canonical suite stays untouched.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	checkSyntheticCanary,
	dispatchSyntheticCanary,
	main,
} from "../../synthetic-canary-liveness.mjs";

const NOW = Date.parse("2026-10-23T13:17:00Z");
const iso = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const repo = "JovieInc/Jovie";
const job = (conclusion = "success") => ({
	name: "Production Synthetic Tests",
	status: "completed",
	conclusion,
});
const run = (overrides = {}) => ({
	id: 100,
	run_attempt: 1,
	event: "schedule",
	head_branch: "main",
	created_at: iso(30),
	updated_at: iso(1),
	status: "completed",
	conclusion: "success",
	display_title: "Production Synthetic Monitoring (17 */6 * * *)",
	...overrides,
});
function githubFor(runs, jobs = { 100: [job()] }) {
	return {
		rest: vi.fn(async (method, path, body) => ({
			status: method === "POST" ? 204 : 200,
			json: () =>
				method === "POST"
					? body
					: path.includes("/workflows/")
						? { workflow_runs: runs }
						: (() => {
								const id = path.match(/runs\/(\d+)/)[1];
								const scoped = jobs[id] ?? jobs[100];
								return { jobs: scoped, total_count: scoped.length };
							})(),
		})),
	};
}
const check = (github) => checkSyntheticCanary({ github, repo, now: NOW });
afterEach(() => vi.restoreAllMocks());

describe("missed-slot backstop", () => {
	it("exposes missedSlot on the freshness miss, never while a run is in flight", async () => {
		expect(
			await check(githubFor([run({ created_at: iso(421) })])),
		).toMatchObject({
			ok: false,
			missedSlot: true,
		});
		const pending = run({ id: 101, status: "in_progress", conclusion: null });
		expect(
			await check(
				githubFor([pending, run({ created_at: iso(421) })], {
					101: [],
					100: [job()],
				}),
			),
		).toMatchObject({ ok: false, missedSlot: false });
		expect(await check(githubFor([run()]))).toMatchObject({ ok: true });
	});

	it("counts an executed dispatched canary on main as heartbeat evidence", async () => {
		expect(
			await check(githubFor([run({ id: 105, event: "workflow_dispatch" })])),
		).toMatchObject({ ok: true, reason: "Scheduled canary healthy" });
		for (const conclusion of ["failure", "skipped"]) {
			expect(
				await check(
					githubFor([run({ id: 106, event: "workflow_dispatch", conclusion })]),
				),
			).toMatchObject({
				ok: false,
				reason: `Scheduled canary run concluded ${conclusion}`,
			});
		}
		expect(
			await check(
				githubFor([
					run({ id: 107, event: "workflow_dispatch", head_branch: "feature" }),
				]),
			),
		).toMatchObject({ ok: false });
	});

	it("dispatch is single-attempt and refuses any status but 204", async () => {
		await expect(
			dispatchSyntheticCanary({ github: githubFor([run()]), repo }),
		).resolves.toBeUndefined();
		await expect(
			dispatchSyntheticCanary({
				github: { rest: async () => ({ status: 403, json: () => ({}) }) },
				repo,
			}),
		).rejects.toThrow("dispatch-rejected");
	});

	it("dispatches once on a missed slot only when opted in, and a refusal stays red", async () => {
		const dir = mkdtempSync(join(tmpdir(), "synthetic-backstop-"));
		vi.spyOn(console, "log").mockImplementation(() => {});
		const dispatchGithub = () => {
			const rest = vi.fn(async (method, path, _body) => {
				if (method === "POST" && path.endsWith("/dispatches"))
					return { status: 403, json: () => ({}) };
				return {
					status: 200,
					json: () => ({ workflow_runs: [run({ created_at: iso(421) })] }),
				};
			});
			return {
				rest,
				posts: () => rest.mock.calls.filter((call) => call[0] === "POST"),
			};
		};
		const env = {
			GITHUB_REPOSITORY: repo,
			GITHUB_OUTPUT: join(dir, "o"),
			GITHUB_STEP_SUMMARY: join(dir, "s"),
		};
		try {
			// Default off: no dispatch call on the same missed slot.
			const off = dispatchGithub();
			expect(await main({ github: off, env, now: NOW })).toBe(1);
			expect(off.posts()).toHaveLength(0);
			// Opted in: exactly one single-attempt dispatch; verdict stays red.
			const on = dispatchGithub();
			expect(
				await main({
					github: on,
					env: { ...env, SYNTHETIC_CANARY_DISPATCH: "1" },
					now: NOW,
				}),
			).toBe(1);
			const posts = on.posts();
			expect(posts).toHaveLength(1);
			expect(posts[0][1]).toBe(
				`/repos/${repo}/actions/workflows/synthetic-monitoring.yml/dispatches`,
			);
			expect(posts[0][2]).toEqual({ ref: "main" });
			expect(readFileSync(env.GITHUB_OUTPUT, "utf8")).toContain(
				"test_status=failed\n",
			);
			// A rejected dispatch never softens the verdict or the exit.
			expect(
				await main({
					github: on,
					env: { ...env, SYNTHETIC_CANARY_DISPATCH: "1" },
					now: NOW,
				}),
			).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
