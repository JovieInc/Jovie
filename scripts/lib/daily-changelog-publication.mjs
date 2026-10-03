import { createHash } from 'node:crypto';
import { isCustomerCopy } from './changelog-filter-rules.mjs';
import {
  DAILY_MAX_BULLETS,
  DAILY_SOURCE_SCHEMA,
  evaluateDailyWindow,
  extractDailyReceipts,
  insertDailyDigest,
  isSafeActionHref,
  processedDailySourceIds,
  renderDailyDigest,
} from './daily-changelog.mjs';

export const NOTE_SCHEMA = 'customer-changelog/v1';
const NOTE_RE = /<!--\s*customer-changelog\/v1\s+([\s\S]*?)\s*-->/g;
const SHA_RE = /^[a-f0-9]{40}$/;
const SECTIONS = new Set(['Added', 'Changed', 'Fixed', 'Removed']);

/** PR/Linear metadata supplies approved copy; titles never become notes. */
export function readCustomerNote(body) {
  const matches = [...String(body ?? '').matchAll(NOTE_RE)];
  if (!matches.length) return { reason: 'missing-metadata' };
  if (matches.length !== 1) return { reason: 'ambiguous' };
  let note;
  try {
    note = JSON.parse(matches[0][1]);
  } catch {
    return { reason: 'malformed' };
  }
  if (note?.releaseWorthy === false) return { reason: 'internal' };
  if (
    note?.availability !== undefined &&
    (!['ga', 'preview', 'limited'].includes(note.availability?.status) ||
      !Array.isArray(note.availability?.prerequisites) ||
      note.availability.prerequisites.length > 5 ||
      !note.availability.prerequisites.every(
        value =>
          typeof value === 'string' &&
          value.trim() &&
          value.length <= 200 &&
          !/[\r\n<>]/.test(value)
      ) ||
      (note.availability.status === 'limited' &&
        note.availability.prerequisites.length === 0))
  )
    return { reason: 'failed-validation' };
  if (
    note?.audience !== 'public' ||
    note?.visibility !== 'public' ||
    note?.releaseWorthy !== true ||
    !/^JOV-\d+$/.test(note?.issueId ?? '') ||
    typeof note?.outcomeKey !== 'string' ||
    !note.outcomeKey.trim() ||
    !SECTIONS.has(note?.section) ||
    typeof note?.text !== 'string' ||
    !note.text.trim() ||
    note.text.length > 400 ||
    /[\r\n<>]/.test(note.text) ||
    /\bJOV-\d+\b|\b(?:implementation|refactor|design token|CI)\b/.test(
      note.text
    ) ||
    !isCustomerCopy(note.text) ||
    !Array.isArray(note?.evidence) ||
    note.evidence.length === 0 ||
    note.evidence.length > 3
  )
    return { reason: 'failed-validation' };
  // Optional richer explanation and a receipt-bound next step (JOV-7493).
  // Details become claim-mapped bullets; the action destination must stay
  // first-party and reachable for signed-out visitors.
  if (
    note?.details !== undefined &&
    (!Array.isArray(note.details) ||
      note.details.length > DAILY_MAX_BULLETS ||
      !note.details.every(
        value =>
          typeof value === 'string' &&
          value.trim() &&
          value.length <= 240 &&
          !/[\r\n<>]/.test(value) &&
          isCustomerCopy(value)
      ))
  )
    return { reason: 'failed-validation' };
  if (
    note?.action !== undefined &&
    (typeof note.action !== 'object' ||
      note.action === null ||
      typeof note.action.label !== 'string' ||
      !note.action.label.trim() ||
      note.action.label.length > 80 ||
      /[\r\n<>]/.test(note.action.label) ||
      !isSafeActionHref(note.action.href))
  )
    return { reason: 'failed-validation' };
  for (const evidence of note.evidence) {
    let url;
    try {
      url = new URL(evidence.url);
    } catch {
      return { reason: 'malformed' };
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['jov.ie', 'docs.jov.ie'].includes(url.hostname) ||
      typeof evidence.contains !== 'string' ||
      !evidence.contains.trim()
    )
      return { reason: 'failed-validation' };
  }
  return { note };
}

/** New customer-code PRs must explicitly decide public outcome vs internal. */
export function evaluateCustomerNoteContract({ files, body, createdAt }) {
  const customerCode = files.some(
    file =>
      /^apps\/(?:web\/(?:app|components\/features|lib)\/|ios\/.*\.swift$|desktop\/src\/)/.test(
        file
      ) && !/\.(?:test|spec|stories)\.[^/]+$|\/(?:tests|__tests__)\//.test(file)
  );
  if (
    !customerCode ||
    Date.parse(createdAt) < Date.parse('2026-10-03T00:00:00Z')
  )
    return { passed: true, applicable: false };
  const verdict = readCustomerNote(body);
  return {
    passed:
      Boolean(verdict.note?.availability) || verdict.reason === 'internal',
    applicable: true,
    reason:
      verdict.note && !verdict.note.availability
        ? 'missing-availability'
        : verdict.reason,
  };
}

/**
 * workflow_run controllers run at main's head when they start, not at the
 * deployed SHA, so the run head may be a strict descendant of marker.sha
 * (same binding as production-marker-state headBinds). `compare` is GitHub's
 * `compare/{marker.sha}...{run.head_sha}` response.
 */
export function isTrustedControllerRun(run, marker, compare) {
  if (
    run?.path !== '.github/workflows/production-controller.yml' ||
    run?.head_branch !== 'main' ||
    run?.event !== 'workflow_run' ||
    !SHA_RE.test(marker?.sha ?? '') ||
    !SHA_RE.test(run?.head_sha ?? '')
  )
    return false;
  if (run.head_sha === marker.sha) return true;
  return (
    compare?.status === 'ahead' &&
    compare?.merge_base_commit?.sha === marker.sha
  );
}

/** A retained verified marker AND an exact fresh public readback are required. */
export function assertPublicationBinding(marker, buildInfo, controller) {
  if (
    !SHA_RE.test(marker?.sha ?? '') ||
    !['promoted', 'skipped_superseded'].includes(marker?.terminalReason) ||
    marker?.authSmoke !== 'passed' ||
    !marker?.selectedLanes?.includes('web') ||
    !marker?.deploymentId ||
    buildInfo?.environment !== 'production' ||
    controller?.verified !== true ||
    String(controller.runId) !== marker.controllerRun ||
    String(controller.attempt) !== marker.controllerAttempt
  )
    throw new Error(
      'Exact verified production marker/public readback binding missing'
    );
  if (
    marker.sha !== buildInfo?.commitSha ||
    marker.deploymentId !== buildInfo?.deploymentId
  ) {
    throw Object.assign(
      new Error('Verified generation is no longer the public deployment'),
      { code: 'PUBLIC_BINDING_MISMATCH' }
    );
  }
}

export function checkPublicationBinding(marker, buildInfo, controller) {
  try {
    assertPublicationBinding(marker, buildInfo, controller);
    return { status: 'bound' };
  } catch (error) {
    if (error.code !== 'PUBLIC_BINDING_MISMATCH') throw error;
    return {
      status: 'deferred',
      reason: 'public-generation-advanced',
      expectedSha: marker.sha,
      observedSha: buildInfo.commitSha,
    };
  }
}

/**
 * Deterministic approved-copy publication, no runtime model or invented facts.
 * Historical recovery uses today's observation date, never the merge date.
 * Later verified changes append to the same day's post/dismissal identity.
 * Published copy stays intact; overflow waits for the next date.
 */
export function planDailyPublication({
  markdown,
  marker,
  buildInfo,
  controller,
  candidates,
  windowKey,
  observedAt,
}) {
  assertPublicationBinding(marker, buildInfo, controller);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(windowKey) ||
    new Date(observedAt).toISOString().slice(0, 10) !== windowKey
  )
    throw new Error('Publication date must match the verified observation day');
  const persisted = extractDailyReceipts(markdown);
  if (persisted.some(receipt => receipt.malformed))
    throw new Error('Malformed persisted daily receipt');
  const currentDay = persisted.find(
    receipt => receipt.window?.key === windowKey
  );
  const publishedStories = currentDay?.stories ?? [];
  if (
    currentDay &&
    (!['stories', 'sourceReceiptIds', 'mergeShas', 'deployments'].every(field =>
      Array.isArray(currentDay[field])
    ) ||
      publishedStories.length > 3)
  )
    throw new Error('Published daily story provenance missing');
  const publishedById = new Map(
    publishedStories.map(story => [story.id, story])
  );
  const processed = processedDailySourceIds(markdown);
  const audit = [];
  const sources = [];
  const draftsByOutcome = new Map();
  for (const candidate of candidates) {
    const pr = candidate.pr;
    const id = `JovieInc/Jovie#${pr?.number}@${pr?.mergeCommit?.oid}`;
    if (processed.has(id)) continue;
    const { note, reason } = readCustomerNote(pr?.body);
    if (!note) {
      audit.push({ id, reason });
      continue;
    }
    if (
      pr?.state !== 'MERGED' ||
      pr?.baseRefName !== 'main' ||
      !SHA_RE.test(pr?.mergeCommit?.oid ?? '') ||
      candidate.ancestor !== true ||
      candidate.evidencePassed !== true
    ) {
      audit.push({ id, reason: 'unavailable' });
      continue;
    }
    const source = {
      schema: DAILY_SOURCE_SCHEMA,
      id,
      outcomeKey: id,
      firstPublicAt: observedAt,
      pr: { number: pr.number, mergeSha: pr.mergeCommit.oid },
      linear: {
        issueId: note.issueId,
        audience: note.audience,
        visibility: note.visibility,
        releaseWorthy: true,
        approvedClaimIds: [id],
        approvedFacts: [note.text, ...(note.details ?? [])],
        sourceLinks: [pr.url, ...note.evidence.map(item => item.url)],
      },
      controller: {
        status: 'succeeded',
        generationId: marker.controllerRun,
        sha: marker.sha,
      },
      deployment: { id: marker.deploymentId, sha: marker.sha },
      deploymentMembership: {
        verified: true,
        mergeSha: pr.mergeCommit.oid,
        headSha: marker.sha,
      },
      buildInfo: { sha: buildInfo.commitSha, observedAt },
    };
    const published = publishedById.get(note.outcomeKey);
    const existing = draftsByOutcome.get(note.outcomeKey);
    if (
      [existing, published].some(
        story =>
          story &&
          (story.summary !== note.text ||
            story.section !== note.section ||
            JSON.stringify(story.availability) !==
              JSON.stringify(note.availability) ||
            JSON.stringify(story.action) !== JSON.stringify(note.action))
      )
    ) {
      throw new Error(
        `Conflicting approved copy for outcome ${note.outcomeKey}`
      );
    }
    sources.push(source);
    if (existing) {
      existing.sourceIds.push(id);
      existing.claimIds.push(id);
    } else {
      draftsByOutcome.set(note.outcomeKey, {
        id: note.outcomeKey,
        section: note.section,
        summary: note.text,
        availability: note.availability,
        bullets: (note.details ?? []).map(text => ({
          text,
          claimIds: [id],
        })),
        ...(note.action !== undefined ? { action: note.action } : {}),
        sourceIds: [id],
        claimIds: [id],
      });
    }
  }
  // Explicit backlog: never silently discard a fourth customer outcome.
  const deferred = [];
  const drafts = [...draftsByOutcome.values()].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  let remaining = 3 - publishedStories.length;
  const selected = drafts.filter(draft => {
    if (publishedById.has(draft.id)) return true;
    if (remaining > 0) {
      remaining--;
      return true;
    }
    deferred.push(...draft.sourceIds);
    return false;
  });
  const selectedIds = new Set(selected.flatMap(draft => draft.sourceIds));
  const result = evaluateDailyWindow({
    windowKey,
    sources: sources.filter(source => selectedIds.has(source.id)),
    drafts: selected,
    processedIds: [...processed],
    evaluatedAt: observedAt,
    promptVersion: 'approved-copy/1',
    modelReceipt: { mode: 'approved-copy', tokens: 0 },
  });
  if (!result.passed) throw new Error(JSON.stringify(result.findings));
  const combinedStories = new Map(
    publishedStories.map(story => [story.id, structuredClone(story)])
  );
  for (const story of result.stories) {
    const scopedStory = {
      ...story,
      availability: draftsByOutcome.get(story.id)?.availability,
      ...(draftsByOutcome.get(story.id)?.action !== undefined
        ? { action: draftsByOutcome.get(story.id).action }
        : {}),
    };
    const previous = combinedStories.get(story.id);
    combinedStories.set(
      story.id,
      previous
        ? {
            ...previous,
            sourceIds: [
              ...new Set([...previous.sourceIds, ...story.sourceIds]),
            ].sort(),
            claimIds: [
              ...new Set([...previous.claimIds, ...story.claimIds]),
            ].sort(),
          }
        : scopedStory
    );
  }
  result.stories = [...combinedStories.values()].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  if (currentDay) {
    for (const field of ['sourceReceiptIds', 'mergeShas'])
      result.receipt[field] = [
        ...new Set([...currentDay[field], ...result.receipt[field]]),
      ].sort();
    result.receipt.deployments = [
      ...new Map(
        [...currentDay.deployments, ...result.receipt.deployments].map(
          deployment => [deployment.id, deployment]
        )
      ).values(),
    ];
    result.receipt.firstPublicAt = {
      ...currentDay.firstPublicAt,
      ...result.receipt.firstPublicAt,
    };
  }
  result.receipt.stories = result.stories;
  result.receipt.publicationHead = marker.sha;
  result.receipt.audit = audit;
  result.receipt.deferred = deferred;
  result.receipt.pending = audit
    .filter(item => item.reason === 'unavailable')
    .map(item => item.id);
  result.receipt.runtimeEvidence = [
    ...(currentDay?.runtimeEvidence ?? []),
    ...candidates.flatMap(candidate => candidate.evidenceReceipts ?? []),
  ];
  const status = result.noChange
    ? deferred.length
      ? 'deferred'
      : 'no-change'
    : 'publish';
  const block = status === 'publish' ? renderDailyDigest(result) : '';
  const content = block
    ? insertDailyDigest(markdown, block, windowKey)
    : markdown;
  return {
    status,
    content,
    result,
    audit,
    deferred,
    sourceHash: createHash('sha256').update(markdown).digest('hex'),
    contentHash: createHash('sha256').update(content).digest('hex'),
  };
}
