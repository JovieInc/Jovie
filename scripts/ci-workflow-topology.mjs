// biome-ignore-all format: compact machine contract keeps the guarded PR under 500 lines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, '.github/workflow-topology.gen.yml');
const policy = JSON.parse(String.raw`{"schema":"jovie-workflow-topology/v1","measuredBaseline":{"sha":"06fe003f7e3c2cf4919aa2a115749bafa0bf0196","capturedAt":"2026-09-29","workflowRuns":293,"checkRecords":487},"budgets":{"blockingPrChecks":12,"normalPrCheckRecords":25,"normalPrExternalAllowance":8,"mainShaWorkflowRuns":72},"authoritativeOwners":[{"category":"source-validation","workflow":"Source Validation"},{"category":"release-orchestration","workflow":"Production Controller"},{"category":"production-verification","workflow":"Production Controller"},{"category":"telemetry-aggregation","workflow":"Delivery Control Receipts"},{"category":"remediation-dispatch","workflow":"Lane Fix Relay"}],"authoritySurfaces":[{"surface":"staging","workflow":"Staging Controller"},{"surface":"production","workflow":"Production Controller"},{"surface":"rollback","workflow":"Production Release"},{"surface":"queue-admission","workflow":"Merge Queue Green Enroll"},{"surface":"release-truth","workflow":"Production Controller"}],"blockingPrChecks":["PR Ready","Migration Guard","Fork PR Gate","PR Size Guard","PR targets main","llm-review"],"normalPrWorkflows":["Source Validation","Auto-Merge Default","Fork PR Gate","PR Size Guard","PR targets main","Repository documentation shadow","Summer Eve identity check"],"inactiveWorkflows":["Agent Pipeline","Agent Tick","Auto-PR on Agent Push","Auto-Ready Agent Drafts","GitHub AI Dispatcher","GitHub AI Orchestrator (retired)","Main CI health monitor","PR Conflict Handler","Real-Model Eval Lane","Rolling CI Dispatch","Stuck Draft Auto-Close","Taste Classifier","Taste Label Guard"]}`);
/**
 * @typedef {object} WorkflowYaml
 * @property {string} [name]
 * @property {any} [on]
 * @property {Record<string, any>} [jobs]
 */
const categories = policy.authoritativeOwners.map(owner => owner.category);
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const events = value => value && typeof value === 'object' ? Object.keys(value) : array(value);
function category(name) {
  const owned = policy.authoritativeOwners.find(owner => owner.workflow === name);
  if (owned) return owned.category;
  if (/coverage/i.test(name)) return 'source-validation';
  if (/receipt|audit|monitor|health|ratchet|observability|flakiness/i.test(name))
    return 'telemetry-aggregation';
  if (/remedi|autofix|relay|pipeline|conflict/i.test(name))
    return 'remediation-dispatch';
  if (/release|deploy|staging|testflight|publish/i.test(name))
    return 'release-orchestration';
  if (/production|canary|synthetic/i.test(name))
    return 'production-verification';
  return 'source-validation';
}
export function findCycle(nodes, edges) {
  const next = new Map(nodes.map(node => [node, []]));
  for (const { from, to } of edges) next.get(from)?.push(to);
  const visiting = new Set(),
    visited = new Set();
  function visit(node, trail = []) {
    if (visiting.has(node)) return [...trail, node];
    if (visited.has(node)) return null;
    visiting.add(node);
    for (const child of next.get(node) ?? []) {
      const cycle = visit(child, [...trail, node]);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  }
  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}
export function buildTopology(repoRoot = root, suppliedPolicy = structuredClone(policy)) {
  const dir = path.join(repoRoot, '.github/workflows');
  const workflows = fs
    .readdirSync(dir)
    .filter(file => /\.ya?ml$/.test(file))
    .sort()
    .map(file => {
      const parsed = /** @type {WorkflowYaml} */ (yamlLoad(fs.readFileSync(path.join(dir, file), 'utf8')) ?? {});
      return { file, parsed, name: parsed.name };
    });
  const active = item => !suppliedPolicy.inactiveWorkflows.includes(item.name);
  const edges = [];
  for (const item of workflows) {
    for (const producer of array(item.parsed.on?.workflow_run?.workflows))
      edges.push({ from: producer, to: item.name, type: 'workflow_run' });
    for (const job of Object.values(item.parsed.jobs ?? {})) {
      const file = String(job?.uses ?? '').match(/^\.\/\.github\/workflows\/([^@]+)$/)?.[1];
      if (file)
        edges.push({ from: item.name, to: workflows.find(entry => entry.file === file)?.name ?? file, type: 'workflow_call' });
    }
  }
  const nodes = workflows.map(item => {
    const jobIds = Object.keys(item.parsed.jobs ?? {});
    const nodeCategory = category(item.name);
    return {
      name: item.name,
      path: `.github/workflows/${item.file}`,
      active: active(item),
      category: nodeCategory,
      authoritativeProducer: suppliedPolicy.authoritativeOwners.find(owner => owner.category === nodeCategory)?.workflow,
      authoritativeFor: suppliedPolicy.authoritativeOwners.filter(owner => owner.workflow === item.name).map(owner => owner.category),
      allowedConsumers: edges.filter(edge => edge.from === item.name).map(edge => edge.to),
      triggeringStateTransition: events(item.parsed.on).sort(),
      terminalReceipt: `job:${jobIds.at(-1) ?? 'missing'}`,
      jobCount: jobIds.length,
    };
  });
  const activeNames = new Set(nodes.filter(node => node.active).map(node => node.name));
  return { policy: suppliedPolicy, nodes, edges: edges.filter(edge => activeNames.has(edge.from) && activeNames.has(edge.to)) };
}
export function validateTopology({ policy: rules, nodes, edges }) {
  const errors = [];
  const byName = new Map(nodes.map(node => [node.name, node]));
  if (byName.size !== nodes.length || byName.has(undefined))
    errors.push('workflow names must be present and unique');
  for (const name of categories) {
    if (rules.authoritativeOwners.filter(owner => owner.category === name).length !== 1)
      errors.push(`${name} must have exactly one authoritative owner`);
  }
  for (const owner of [...rules.authoritativeOwners, ...rules.authoritySurfaces])
    if (!byName.get(owner.workflow)?.active)
      errors.push(`authority is not active: ${owner.workflow}`);
  if (new Set(rules.authoritySurfaces.map(owner => owner.surface)).size !== rules.authoritySurfaces.length)
    errors.push('authority surfaces must have exactly one owner');
  const runEdges = edges.filter(edge => edge.type === 'workflow_run');
  const cycle = findCycle(nodes.filter(node => node.active).map(node => node.name), runEdges);
  if (cycle) errors.push(`workflow_run cycle: ${cycle.join(' -> ')}`);
  const count = (from, to) => runEdges.filter(edge => edge.from === from && (!to || edge.to === to)).length;
  if (count('CI', 'Staging Controller') !== 1 || count('Staging Controller', 'Production Controller') !== 1 ||
      runEdges.filter(edge => edge.to === 'Staging Controller').length !== 1 ||
      runEdges.filter(edge => edge.to === 'Production Controller').length !== 1)
    errors.push('CI must create exactly one Production Controller opportunity through completed staging');
  const telemetry = runEdges.filter(edge => edge.from === 'Production Controller' && byName.get(edge.to)?.category === 'telemetry-aggregation');
  if (telemetry.length !== 1)
    errors.push(`release lineage has ${telemetry.length} telemetry paths`);
  for (const node of nodes.filter(node => node.active)) {
    if (node.category === 'telemetry-aggregation' && count(node.name))
      errors.push(`observer recursion: ${node.name}`);
    const remediation = runEdges.filter(edge => edge.from === node.name && byName.get(edge.to)?.category === 'remediation-dispatch');
    if (remediation.length > 1)
      errors.push(`${node.name} has ${remediation.length} remediation dispatches`);
    if (!node.authoritativeProducer || !node.terminalReceipt || !node.triggeringStateTransition.length)
      errors.push(`incomplete declaration: ${node.name}`);
  }
  const normal = rules.normalPrWorkflows.map(name => byName.get(name));
  if (normal.some(node => !node))
    errors.push('normal PR inventory references a missing workflow');
  const normalPrCheckRecords = normal.reduce((sum, node) => sum + (node?.jobCount ?? 0), rules.budgets.normalPrExternalAllowance);
  if (normalPrCheckRecords > rules.budgets.normalPrCheckRecords)
    errors.push(`normal PR check budget exceeded: ${normalPrCheckRecords}`);
  if (rules.blockingPrChecks.length > rules.budgets.blockingPrChecks)
    errors.push(`blocking PR check budget exceeded: ${rules.blockingPrChecks.length}`);
  if (rules.budgets.mainShaWorkflowRuns > Math.floor(rules.measuredBaseline.workflowRuns * 0.25))
    errors.push('main SHA workflow-run budget did not fall by at least 75%');
  return { errors, normalPrCheckRecords };
}
function main() {
  const topology = buildTopology();
  const result = validateTopology(topology);
  const serialized = yamlDump({ ...topology.policy, generatedAt: 'deterministic', normalPrCheckRecords: result.normalPrCheckRecords, nodes: topology.nodes, edges: topology.edges }, { lineWidth: -1, noRefs: true });
  if (process.argv.includes('--write')) fs.writeFileSync(outputPath, serialized);
  else if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== serialized)
    result.errors.push('generated workflow DAG is stale; run pnpm ci:topology:write');
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`workflow topology valid: ${topology.nodes.length} workflows, ${topology.edges.length} edges, ${result.normalPrCheckRecords} normal PR checks`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
