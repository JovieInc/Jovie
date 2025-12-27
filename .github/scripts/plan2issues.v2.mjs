// node >=20, ESM, no build step

import crypto from 'node:crypto';
import fs from 'node:fs';
import { Octokit } from 'octokit';

// Config
const planPath = process.env.PLAN_PATH || 'windsurf.plan.md';
const copilotAssignee = process.env.COPILOT_ASSIGNEE || 'github-copilot';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN required');
if (!process.env.GITHUB_REPOSITORY)
  throw new Error('GITHUB_REPOSITORY required');
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

const octo = new Octokit({ auth: token });

// Read plan
const raw = fs.readFileSync(planPath, 'utf8');

// Section → label mapping (extend as needed)
const sectionLabelMap = new Map([
  ['MVP Acceptance Criteria', 'area:mvp'],
  ['Section 1: Diagnosis', 'area:diagnosis'],
  ['Section 2: Step-by-Step Fix Plan', 'area:fix'],
  ['Section 3: Launch & Validation', 'area:launch'],
  ['Section 4: Follow-ups (Optional)', 'area:followup'],
  ['Task List', 'area:plan'],
  ['Notes', 'area:notes'],
]);

// Top-level container bullets to skip (act like epics, not issues)
const skipEpicTitles = new Set([
  'MVP Acceptance Criteria',
  'Section 1: Diagnosis',
  'Section 2: Step-by-Step Fix Plan',
  'Section 3: Launch & Validation',
  'Section 4: Follow-ups (Optional)',
]);

// Parse tasks (supports indentation). States: " "=open, "/"=in-progress, "x"=done
const lines = raw.split(/\r?\n/);
let currentSection = null;
const tasks = [];
for (const line of lines) {
  const sec = /^##\s+(.+)$/.exec(line);
  if (sec) {
    currentSection = sec[1].trim();
    continue;
  }
  const m = /^\s*-\s*\[([ x/])\]\s+(.*)$/.exec(line);
  if (!m) continue;
  const state = m[1];
  const title = m[2].trim();
  if (skipEpicTitles.has(title)) continue; // don't create issues for container bullets
  const id = crypto
    .createHash('sha1')
    .update(`${title}|${currentSection || ''}`)
    .digest('hex')
    .slice(0, 10);
  const labels = new Set([
    'mvp',
    'agent:copilot',
    sectionLabelMap.get(currentSection) || 'area:unsorted',
  ]);
  if (state === '/') labels.add('status:in-progress');
  tasks.push({
    id,
    title,
    state,
    section: currentSection,
    labels: Array.from(labels),
  });
}

async function ensureLabel(name, color, description) {
  try {
    await octo.rest.issues.getLabel({ owner, repo, name });
  } catch {
    await octo.rest.issues.createLabel({
      owner,
      repo,
      name,
      color,
      description,
    });
  }
}

// Ensure common labels exist
await ensureLabel('mvp', '0e8a16', 'MVP deliverable');
await ensureLabel('agent:copilot', '5319e7', 'Send to Copilot coding agent');
await ensureLabel('status:in-progress', 'fbca04', 'Task is in progress');
await ensureLabel('area:unsorted', 'd4c5f9', 'No section detected');
for (const [, name] of sectionLabelMap) {
  await ensureLabel(name, '0366d6', 'Auto from section header');
}

// Fetch existing issues (all states) and index by hidden id
const existingAll = await octo.paginate(octo.rest.issues.listForRepo, {
  owner,
  repo,
  state: 'all',
  per_page: 100,
});
const byId = new Map();
for (const iss of existingAll) {
  const match = /<!--\s*id:\s*([a-f0-9]{10})\s*-->/.exec(iss.body || '');
  if (match) byId.set(match[1], iss);
}

async function assignCopilot(issue_number) {
  try {
    await octo.rest.issues.addAssignees({
      owner,
      repo,
      issue_number,
      assignees: [copilotAssignee],
    });
  } catch (e) {
    console.warn(
      `Assignee '${copilotAssignee}' failed for #${issue_number}: ${e.status || ''} ${e.message || e}`
    );
  }
}

let created = 0,
  updated = 0,
  closed = 0,
  reopened = 0;

for (const t of tasks) {
  const body = `<!-- id:${t.id} -->\nAuto-synced from ${planPath}.\n\n**Task**\n- ${t.title}\n\n**Section**\n- ${t.section || 'n/a'}\n\n**Definition of Done**\n- Code compiles & tests pass\n- No console errors on target routes\n- Update ${planPath} (check off)`;

  const found = byId.get(t.id);
  if (!found) {
    // Create new issue
    const res = await octo.rest.issues.create({
      owner,
      repo,
      title: t.title,
      body,
      labels: t.labels,
      assignees: t.state === 'x' ? [] : [copilotAssignee],
    });
    created++;
    if (t.state === 'x') {
      await octo.rest.issues.update({
        owner,
        repo,
        issue_number: res.data.number,
        state: 'closed',
      });
      closed++;
    }
    continue;
  }

  // Update existing
  await octo.rest.issues.update({
    owner,
    repo,
    issue_number: found.number,
    title: t.title,
    body,
  });
  await octo.rest.issues.setLabels({
    owner,
    repo,
    issue_number: found.number,
    labels: t.labels,
  });
  updated++;

  // State transitions
  const shouldClose = t.state === 'x';
  const isClosed = found.state === 'closed';
  if (shouldClose && !isClosed) {
    await octo.rest.issues.update({
      owner,
      repo,
      issue_number: found.number,
      state: 'closed',
    });
    closed++;
  } else if (!shouldClose && isClosed) {
    await octo.rest.issues.update({
      owner,
      repo,
      issue_number: found.number,
      state: 'open',
    });
    reopened++;
  }

  // Ensure Copilot assigned for open work
  if (!shouldClose) {
    const alreadyAssigned = (found.assignees || []).some(
      a => a.login === copilotAssignee
    );
    if (!alreadyAssigned) await assignCopilot(found.number);
  }
}

console.log(
  `Synced ${tasks.length} tasks from ${planPath} (created:${created}, updated:${updated}, closed:${closed}, reopened:${reopened})`
);
