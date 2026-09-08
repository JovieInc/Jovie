/** Read-only source-to-terminal projection over canonical delivery receipts. */

import {
	DELIVERY_RECEIPT_SCHEMA,
	transitionDeliveryReceipt,
} from "./delivery-state-machine.mjs";

export const SHIPPING_OBSERVABILITY_SCHEMA = "jovie-shipping-observability/v1";
export const UNKNOWN = "UNKNOWN";

const ROLE_BY_STAGE = Object.freeze({
	received: "coordinator",
	classified: "coordinator",
	leased: "executor",
	"draft-pr": "executor",
	"ci-pending": "reviewer",
	"queue-pending": "reviewer",
	queued: "reviewer",
	merged: "mergeActor",
	"deployment-pending": "deploymentActor",
	"production-proven": "deploymentActor",
});
const REQUIRED_ROLES = Object.freeze([
	"coordinator",
	"executor",
	"reviewer",
	"mergeActor",
	"deploymentActor",
]);
const ROLE_REQUIRED_STAGES = Object.freeze({
	coordinator: new Set([...Object.keys(ROLE_BY_STAGE)]),
	executor: new Set([
		"leased",
		"draft-pr",
		"ci-pending",
		"queue-pending",
		"queued",
		"merged",
		"deployment-pending",
		"production-proven",
	]),
	reviewer: new Set([
		"ci-pending",
		"queue-pending",
		"queued",
		"merged",
		"deployment-pending",
		"production-proven",
	]),
	mergeActor: new Set(["merged", "deployment-pending", "production-proven"]),
	deploymentActor: new Set(["deployment-pending", "production-proven"]),
});
const EXECUTION_STATES = new Set(["active", "waiting"]);

function text(value, max = 240) {
	return typeof value === "string" && value.trim() && value.trim().length <= max
		? value.trim()
		: null;
}

function time(value) {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value) {
	return Number.isInteger(value) && value > 0 ? value : null;
}

function shippingEvidence(receipt) {
	const value =
		receipt?.transition?.evidence?.shipping ||
		receipt?.event?.evidence?.shipping;
	return value && typeof value === "object" && !Array.isArray(value)
		? value
		: null;
}

function unknown(reason, owner, action) {
	return { status: UNKNOWN, reason, owner, action };
}

function measured(value, evidence) {
	return { status: "measured", value, evidence };
}

function actorEvidence(value, expectedRole) {
	if (!value || value.role !== expectedRole) return null;
	const id = text(value.id, 120);
	const evidence = text(value.evidence, 500);
	return id && evidence ? { id, evidence } : null;
}

function executionEvidence(value) {
	if (!value || !EXECUTION_STATES.has(value.state)) return null;
	const fields = ["provider", "model", "harness", "taskId", "attemptId"];
	const normalized = Object.fromEntries(
		fields.map((field) => [field, text(value[field], 160)]),
	);
	return fields.every((field) => normalized[field])
		? { ...normalized, state: value.state }
		: null;
}

function valueEvidence(value) {
	if (
		!value ||
		!["founder-request", "summer-priority"].includes(value.authority)
	)
		return null;
	const decisionId = text(value.decisionId, 160);
	const rationale = text(value.rationale, 500);
	const expectedBenefit = text(value.expectedBenefit, 500);
	const observedOutcome = text(value.observedOutcome, 500);
	return decisionId && rationale && expectedBenefit
		? {
				authority: value.authority,
				decisionId,
				rationale,
				expectedBenefit,
				observedOutcome,
			}
		: null;
}

function referenceEvidence(receipt, value) {
	if (!value) return null;
	const issue = text(value.issue, 80);
	const pr = positiveInteger(value.pr);
	const headSha = text(value.headSha, 40)?.toLowerCase();
	const runId = text(String(value.runId || ""), 80);
	if (!issue || !pr || !/^[0-9a-f]{40}$/.test(headSha || "") || !runId)
		return null;
	if (
		issue !== receipt.event.issue ||
		pr !== receipt.event.pr ||
		headSha !== receipt.event.headSha
	)
		return null;
	return {
		issue,
		pr,
		headSha,
		runId,
		deploymentId: text(value.deploymentId, 160),
	};
}

function orderedChain(receipts) {
	if (!Array.isArray(receipts) || receipts.length === 0)
		return { error: "receipt-chain-empty" };
	const byKey = new Map(
		receipts.map((receipt) => [receipt?.receiptKey, receipt]),
	);
	if (byKey.size !== receipts.length || byKey.has(undefined))
		return { error: "receipt-key-missing-or-duplicate" };
	const children = new Map();
	for (const receipt of receipts) {
		if (receipt?.schema !== DELIVERY_RECEIPT_SCHEMA)
			return { error: "receipt-schema-invalid" };
		if (receipt.previousReceiptKey) {
			if (!byKey.has(receipt.previousReceiptKey))
				return { error: "receipt-chain-incomplete" };
			if (children.has(receipt.previousReceiptKey))
				return { error: "receipt-chain-forked" };
			children.set(receipt.previousReceiptKey, receipt.receiptKey);
		}
	}
	const roots = receipts.filter((receipt) => !receipt.previousReceiptKey);
	if (roots.length !== 1) return { error: "receipt-chain-root-invalid" };
	const ordered = [];
	let current = roots[0];
	while (current) {
		ordered.push(current);
		current = byKey.get(children.get(current.receiptKey));
	}
	if (ordered.length !== receipts.length)
		return { error: "receipt-chain-disconnected" };
	for (let index = 0; index < ordered.length; index += 1) {
		const observedAt = time(ordered[index].observedAt);
		if (
			observedAt === null ||
			(index && observedAt < time(ordered[index - 1].observedAt))
		) {
			return { error: "receipt-time-invalid" };
		}
	}
	return { ordered };
}

/** Add bounded evidence without changing the canonical state machine. */
export function transitionShippingReceipt(
	receipt,
	transition,
	shipping,
	options = {},
) {
	if (!shipping || typeof shipping !== "object" || Array.isArray(shipping))
		throw new Error("shipping transition evidence is missing or malformed");
	const next = transitionDeliveryReceipt(receipt, transition, options);
	return {
		...next,
		transition: { ...next.transition, evidence: { shipping } },
	};
}

export function projectShippingChain(
	receipts,
	{ now = new Date().toISOString(), staleAfterMs = 30 * 60 * 1000 } = {},
) {
	const chain = orderedChain(receipts);
	if (chain.error) {
		return {
			schema: SHIPPING_OBSERVABILITY_SCHEMA,
			qualification: unknown(
				chain.error,
				"Gem",
				"repair-receipt-chain-instrumentation",
			),
		};
	}
	const ordered = chain.ordered;
	const first = ordered[0];
	const last = ordered.at(-1);
	const actors = Object.fromEntries(
		REQUIRED_ROLES.map((role) => [
			role,
			unknown(
				"actor-evidence-missing",
				role === "coordinator" ? "Summer" : "Gem",
				"record-actual-stage-actor",
			),
		]),
	);
	let execution = unknown(
		"execution-evidence-missing",
		"Symphony",
		"record-provider-model-harness-task-attempt",
	);
	let value = unknown(
		"value-justification-missing",
		"Summer",
		"record-founder-request-or-summer-priority",
	);
	let refs = unknown(
		"source-pr-run-evidence-missing",
		"Gem",
		"record-exact-source-pr-run-binding",
	);
	let referenceMismatch = false;
	let retries = 0;
	const failureCauses = {};

	for (const receipt of ordered) {
		const evidence = shippingEvidence(receipt);
		const expectedRole = ROLE_BY_STAGE[receipt.stage];
		if (expectedRole) {
			const actor = actorEvidence(evidence?.actor, expectedRole);
			if (actor) actors[expectedRole] = measured(actor.id, actor.evidence);
		}
		const executionCandidate = executionEvidence(evidence?.execution);
		if (executionCandidate)
			execution = measured(
				executionCandidate,
				evidence.execution.evidence || receipt.receiptKey,
			);
		const valueCandidate = valueEvidence(evidence?.value);
		if (valueCandidate) value = measured(valueCandidate, receipt.receiptKey);
		const refsCandidate = referenceEvidence(receipt, evidence?.refs);
		if (refsCandidate) refs = measured(refsCandidate, receipt.receiptKey);
		else if (evidence?.refs) referenceMismatch = true;
		const retryCount =
			Number.isInteger(evidence?.retry?.count) && evidence.retry.count >= 0
				? evidence.retry.count
				: 0;
		retries += retryCount;
		const cause = text(evidence?.retry?.cause, 120);
		if (retryCount && cause)
			failureCauses[cause] = (failureCauses[cause] || 0) + retryCount;
	}

	const stageTimings = ordered.slice(1).map((receipt, index) => ({
		from: ordered[index].stage,
		to: receipt.stage,
		durationMs: time(receipt.observedAt) - time(ordered[index].observedAt),
		status: "measured",
	}));
	const lastAgeMs = time(now) - time(last.observedAt);
	const reachedStages = new Set(ordered.map((receipt) => receipt.stage));
	const defects = [
		...Object.entries(actors)
			.filter(
				([role, field]) =>
					field.status === UNKNOWN &&
					[...ROLE_REQUIRED_STAGES[role]].some((stage) =>
						reachedStages.has(stage),
					),
			)
			.map(([role]) => `missing-${role}`),
		...(execution.status === UNKNOWN &&
		[...reachedStages].some((stage) => ROLE_REQUIRED_STAGES.executor.has(stage))
			? ["missing-execution"]
			: []),
		...(value.status === UNKNOWN ? ["missing-value"] : []),
		...(refs.status === UNKNOWN ? ["missing-refs"] : []),
		...(referenceMismatch ? ["source-pr-run-mismatch"] : []),
		...(lastAgeMs < 0 || lastAgeMs > staleAfterMs ? ["stale-observation"] : []),
	];
	const terminal = last.stage === "production-proven";
	if (terminal && !value.value?.observedOutcome)
		defects.push("missing-observed-outcome");
	const qualification = defects.length
		? unknown(
				defects.join(","),
				"Gem",
				"repair-attribution-instrumentation-before-shipping-claim",
			)
		: terminal
			? measured("production-proven", last.receiptKey)
			: measured("in-progress", last.receiptKey);
	return {
		schema: SHIPPING_OBSERVABILITY_SCHEMA,
		deliveryKey: first.event.deliveryKey,
		stage: last.stage,
		terminal,
		executionState:
			execution.status === "measured" ? execution.value.state : UNKNOWN,
		actors,
		execution,
		value,
		refs,
		stageTimings,
		leadTimeMs: measured(
			time(last.observedAt) - time(first.observedAt),
			`${first.receiptKey}:${last.receiptKey}`,
		),
		retries: measured(
			retries,
			ordered.map((receipt) => receipt.receiptKey),
		),
		failureCauses,
		observedAt: last.observedAt,
		qualification,
	};
}

export function projectShippingPortfolio(
	chains,
	{
		now = new Date().toISOString(),
		windowMs = 7 * 24 * 60 * 60 * 1000,
		staleAfterMs,
	} = {},
) {
	const items = (Array.isArray(chains) ? chains : []).map((chain) =>
		projectShippingChain(chain, { now, staleAfterMs }),
	);
	const cutoff = time(now) - windowMs;
	const qualified = items.filter(
		(item) => item.qualification?.status === "measured",
	);
	const completed = qualified.filter(
		(item) => item.terminal && time(item.observedAt) >= cutoff,
	);
	const open = qualified.filter((item) => !item.terminal);
	const oldestBlocked =
		open
			.filter((item) =>
				["repair-pending", "evidence-pending", "external-blocked"].includes(
					item.stage,
				),
			)
			.sort(
				(left, right) => time(left.observedAt) - time(right.observedAt),
			)[0] || null;
	const unqualified = items.filter(
		(item) => item.qualification?.status === UNKNOWN,
	);
	const unknownMetric = (name) =>
		unknown(
			`${name}-unqualified`,
			"Gem",
			"repair-chain-evidence-before-portfolio-claim",
		);
	return {
		schema: SHIPPING_OBSERVABILITY_SCHEMA,
		items,
		throughput: unqualified.length
			? unknownMetric("throughput")
			: measured(completed.length, {
					windowMs,
					cutoff: new Date(cutoff).toISOString(),
				}),
		active: unqualified.length
			? unknownMetric("active")
			: measured(
					open.filter((item) => item.executionState === "active").length,
					"qualified-open-chains",
				),
		waiting: unqualified.length
			? unknownMetric("waiting")
			: measured(
					open.filter((item) => item.executionState === "waiting").length,
					"qualified-open-chains",
				),
		retries: measured(
			qualified.reduce((sum, item) => sum + item.retries.value, 0),
			"qualified-chains",
		),
		oldestBlocked: oldestBlocked
			? measured(
					{
						deliveryKey: oldestBlocked.deliveryKey,
						stage: oldestBlocked.stage,
						observedAt: oldestBlocked.observedAt,
					},
					oldestBlocked.qualification.evidence,
				)
			: measured(null, "qualified-open-chains"),
		qualification: unqualified.length
			? unknown(
					`${unqualified.length}-unqualified-chain(s)`,
					"Gem",
					"repair-chain-evidence-before-portfolio-claim",
				)
			: measured(
					"qualified",
					items.map((item) => item.deliveryKey),
				),
	};
}
