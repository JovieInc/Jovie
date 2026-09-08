import { pathToFileURL } from "node:url";

/**
 * @typedef {object} PolicyGate
 * @property {string} id
 * @property {string} transition
 * @property {string} mode
 * @property {string[]} [requires]
 * @property {string[]} [dependsOn]
 * @property {string} [reason]
 * @property {string} [owner]
 * @property {string} [remedy]
 * @property {string} [evidenceSource]
 */

/**
 * @typedef {object} PolicyGateConfiguration
 * @property {Record<string, string[]>} blockingAllowlist
 * @property {PolicyGate[]} gates
 */

export const POLICY_STAGES = Object.freeze([
	"pre-draft",
	"draft-publication",
	"fast-ci",
	"remediation",
	"promotion",
	"landing",
]);

export const POLICY_EVIDENCE = Object.freeze({
	"branch-ref": "pre-draft",
	"committed-diff": "pre-draft",
	"local-hook-policy": "pre-draft",
	"local-secret-scan": "pre-draft",
	"github-pr-metadata": "draft-publication",
	"exact-head-ci": "fast-ci",
	"remediation-receipt": "remediation",
	"coverage-security-policy": "promotion",
});

/** @type {PolicyGateConfiguration} */
export const DEFAULT_POLICY_GATES = Object.freeze({
	blockingAllowlist: {
		"draft-publication": [
			"diff-integrity",
			"publication-secret-scan",
			"hook-policy",
		],
		promotion: ["exact-head-green"],
		landing: ["promotion-evidence"],
	},
	gates: /** @type {PolicyGate[]} */ ([
		{
			id: "branch-recommendation",
			transition: "draft-publication",
			mode: "advisory",
			requires: ["branch-ref"],
		},
		...[
			["diff-integrity", "committed-diff", "CI", "repair the committed diff"],
			[
				"publication-secret-scan",
				"local-secret-scan",
				"Security",
				"remove or rotate the exposed secret",
			],
			[
				"hook-policy",
				"local-hook-policy",
				"Developer Experience",
				"repair the publication hook policy",
			],
		].map(([id, evidenceSource, owner, remedy]) => ({
			id,
			transition: "draft-publication",
			mode: "blocking",
			requires: [evidenceSource],
			reason: "prevent unsafe draft publication",
			owner,
			remedy,
			evidenceSource,
		})),
		...[
			[
				"exact-head-green",
				"promotion",
				["exact-head-ci", "remediation-receipt"],
				"promote only the repaired exact head",
				"Gem",
				"repair and rerun the exact failing lane",
				"GitHub checks and rolling CI receipt",
			],
			[
				"promotion-evidence",
				"landing",
				["coverage-security-policy"],
				"land only fully qualified changes",
				"Gem",
				"complete required coverage, security, and policy checks",
				"required exact-head checks",
			],
		].map(
			([id, transition, requires, reason, owner, remedy, evidenceSource]) => ({
				id,
				transition,
				mode: "blocking",
				requires,
				reason,
				owner,
				remedy,
				evidenceSource,
			}),
		),
	]),
});

/** @param {PolicyGateConfiguration} [policy] */
export function validatePolicyGates(policy = DEFAULT_POLICY_GATES) {
	const errors = [];
	const byId = new Map(policy.gates.map((gate) => [gate.id, gate]));
	const visiting = new Set();
	const visited = new Set();
	const visit = (id) => {
		if (visiting.has(id)) {
			errors.push(`policy cycle detected at ${id}`);
			return;
		}
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const gate of policy.gates) visit(gate.id);

	for (const gate of policy.gates) {
		const transition = POLICY_STAGES.indexOf(gate.transition);
		if (transition < 1) errors.push(`${gate.id}: invalid guarded transition`);
		if (gate.mode === "blocking") {
			if (
				!(policy.blockingAllowlist[gate.transition] ?? []).includes(gate.id)
			) {
				errors.push(
					`${gate.id}: blocker is not allowlisted for ${gate.transition}`,
				);
			}
			for (const field of ["reason", "owner", "remedy", "evidenceSource"]) {
				if (!gate[field])
					errors.push(`${gate.id}: blocking gate requires ${field}`);
			}
		} else if (gate.mode !== "advisory") {
			errors.push(`${gate.id}: recommendations default to advisory`);
		}
		for (const evidence of gate.requires ?? []) {
			const available = POLICY_STAGES.indexOf(POLICY_EVIDENCE[evidence]);
			if (available < 0 || available >= transition) {
				errors.push(
					`${gate.id}: ${evidence} is not available before ${gate.transition}`,
				);
			}
		}
		for (const dependency of gate.dependsOn ?? []) {
			const dependencyStage = POLICY_STAGES.indexOf(
				byId.get(dependency)?.transition,
			);
			if (!byId.has(dependency) || dependencyStage >= transition) {
				errors.push(
					`${gate.id}: dependency ${dependency} is not strictly earlier`,
				);
			}
		}
	}
	return { ok: errors.length === 0, errors };
}

const RECOVERY_STATES = new Set([
	"ready",
	"active",
	"waiting",
	"blocked",
	"unknown",
	"complete",
]);

function validRecoveryPath(path, byId, now) {
	const from = path?.breaksDependency?.from;
	const to = path?.breaksDependency?.to;
	const scope = path?.scope;
	return Boolean(
		path?.authority === "source-qualified-recovery" &&
			byId.has(from) &&
			byId.has(to) &&
			byId.get(from).repairs?.includes(to) &&
			byId.get(from).dependsOn?.includes(to) &&
			scope?.repository &&
			Number.isInteger(scope.pr) &&
			/^[0-9a-f]{40}$/.test(scope.headSha || "") &&
			path.maxAttempts === 1 &&
			path.preservesUnrelatedWork === true &&
			Number.isFinite(Date.parse(path.expiresAt)) &&
			Date.parse(path.expiresAt) > now &&
			path.owner &&
			path.progressCondition,
	);
}

/**
 * Diagnose a runtime recovery wait-for graph without mutating it. A validated
 * source-qualified recovery path may remove exactly one self-recovery edge in
 * the projection; it is never executable authority by itself.
 */
export function evaluateRecoveryLiveness(
	graph,
	{ now = new Date().toISOString(), evidenceMaxAgeMs = 15 * 60 * 1000 } = {},
) {
	const nowMs = Date.parse(now);
	const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
	const byId = new Map(nodes.map((node) => [node?.id, node]));
	const errors = [];
	const unknown = [];
	const stalled = [];
	const cutEdges = new Set();
	const recoveryActions = [];

	if (!Number.isFinite(nowMs))
		errors.push("recovery observation time is invalid");
	if (byId.size !== nodes.length || byId.has(undefined))
		errors.push("recovery node ids are missing or duplicated");

	for (const node of nodes) {
		if (!RECOVERY_STATES.has(node.state))
			errors.push(`${node.id}: recovery state is invalid`);
		if (!node.owner || !node.remedy)
			errors.push(`${node.id}: owner and remedy are required`);
		const observedAt = Date.parse(node.observedAt);
		if (
			!Number.isFinite(observedAt) ||
			nowMs - observedAt > evidenceMaxAgeMs ||
			node.state === "unknown"
		) {
			unknown.push({
				id: node.id,
				owner: node.owner || "UNKNOWN",
				action: node.remedy || "refresh-dependency-evidence",
			});
		}
		const progressAt = Date.parse(node.progressAt || node.observedAt);
		if (
			["waiting", "blocked"].includes(node.state) &&
			Number.isFinite(progressAt) &&
			Number.isFinite(node.maxWaitMs) &&
			nowMs - progressAt > node.maxWaitMs
		) {
			stalled.push({
				id: node.id,
				owner: node.owner,
				action: node.remedy,
				reason: "bounded-wait-expired-without-progress",
			});
		}
		for (const dependency of node.dependsOn || []) {
			if (!byId.has(dependency)) {
				unknown.push({
					id: node.id,
					owner: node.owner,
					action: `refresh-missing-dependency:${dependency}`,
				});
			}
		}
	}

	for (const path of graph?.recoveryPaths || []) {
		if (!validRecoveryPath(path, byId, nowMs)) {
			errors.push(
				`${path?.id || "recovery-path"}: scoped recovery path is invalid`,
			);
			continue;
		}
		const edge = `${path.breaksDependency.from}->${path.breaksDependency.to}`;
		const unrelated = (graph?.workInProgress || []).filter(
			(item) => item.scopeKey !== path.scope.scopeKey,
		);
		const scopedStuck = (graph?.workInProgress || []).filter(
			(item) =>
				item.scopeKey === path.scope.scopeKey &&
				item.blockedOn === path.breaksDependency.to,
		);
		if (unrelated.length && path.requiresEmptyWip === true) {
			recoveryActions.push({
				path: path.id,
				status: "waiting",
				reason: "unrelated-wip-preserved",
				owner: path.owner,
				progressCondition: path.progressCondition,
			});
			continue;
		}
		cutEdges.add(edge);
		recoveryActions.push({
			path: path.id,
			status: "authorized-edge-removal",
			edge,
			owner: path.owner,
			scope: path.scope,
			maxAttempts: 1,
			stuckWork: scopedStuck.map((item) => item.id),
			preservesUnrelatedWork: true,
			progressCondition: path.progressCondition,
		});
	}

	const cycles = [];
	const visiting = [];
	const visited = new Set();
	const visit = (id) => {
		const start = visiting.indexOf(id);
		if (start >= 0) {
			cycles.push([...visiting.slice(start), id]);
			return;
		}
		if (visited.has(id)) return;
		visiting.push(id);
		for (const dependency of byId.get(id)?.dependsOn || []) {
			if (!cutEdges.has(`${id}->${dependency}`) && byId.has(dependency))
				visit(dependency);
		}
		visiting.pop();
		visited.add(id);
	};
	for (const node of nodes) visit(node.id);

	for (const node of nodes) {
		for (const target of node.repairs || []) {
			if (
				node.dependsOn?.includes(target) &&
				!cutEdges.has(`${node.id}->${target}`)
			)
				cycles.push([node.id, target, node.id]);
		}
	}
	const dedupedCycles = [
		...new Map(cycles.map((cycle) => [cycle.join("->"), cycle])).values(),
	];
	const ok =
		errors.length === 0 &&
		unknown.length === 0 &&
		stalled.length === 0 &&
		dedupedCycles.length === 0;
	return {
		ok,
		qualification: ok ? "measured" : "UNKNOWN",
		errors,
		cycles: dedupedCycles,
		stalled,
		unknown,
		recoveryActions,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const result = validatePolicyGates();
	if (!result.ok) {
		console.error(result.errors.join("\n"));
		process.exitCode = 1;
	} else {
		console.log("Policy gates are bootstrap-safe, acyclic, and monotonic.");
	}
}
