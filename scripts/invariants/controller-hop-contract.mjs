// JOV-INV-022: reject new controller hops without a bounded exception.

export const CONTROLLER_HOP_INVARIANT_ID = 'JOV-INV-022';
export const CONTROLLER_HOP_EXCEPTION_SCHEMA = 'jovie-controller-hop/v1';

const WORKFLOW_FILE_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const CONTROLLER_SIGNAL_PATTERNS = Object.freeze([
  { signal: 'workflow_run', pattern: /\bworkflow_run\b/ },
  { signal: 'pull_request_target', pattern: /\bpull_request_target\b/ },
  { signal: 'schedule', pattern: /\bschedule\b/ },
  {
    signal: 'create-github-app-token',
    pattern: /\bcreate-github-app-token\b/,
  },
  { signal: 'gh-api', pattern: /\bgh\s+api\b/ },
  { signal: 'gh-pr', pattern: /\bgh\s+pr\b/ },
  { signal: 'gh-issue', pattern: /\bgh\s+issue\b/ },
  { signal: 'pull-requests-write', pattern: /\bpull-requests:\s*write\b/ },
  { signal: 'contents-write', pattern: /\bcontents:\s*write\b/ },
  { signal: 'issues-write', pattern: /\bissues:\s*write\b/ },
]);
const hasText = (value, minLength = 1) =>
  typeof value === 'string' && value.trim().length >= minLength;
const markerValue = (source, marker) =>
  source
    .match(new RegExp(`^\\s*#\\s*${marker}:\\s*(.+?)\\s*$`, 'mi'))?.[1]
    ?.trim() ?? '';

export function controllerCapabilityFingerprints(source = '') {
  return String(source ?? '')
    .split(/\r?\n/)
    .flatMap(line => {
      const normalized = line.trim().replace(/\s+/g, ' ');
      if (!normalized) return [];
      return CONTROLLER_SIGNAL_PATTERNS.filter(({ pattern }) =>
        pattern.test(normalized)
      ).map(({ signal }) => `${signal}:${normalized}`);
    });
}

export const isControllerCapableWorkflow = (path, source = '') =>
  WORKFLOW_FILE_RE.test(path) &&
  controllerCapabilityFingerprints(source).length > 0;

export function parseControllerHopException(source = '') {
  return {
    schema: markerValue(source, 'controller-hop-exception'),
    accountableWriter: markerValue(source, 'accountable-writer'),
    trustBoundary: markerValue(source, 'necessary-trust-boundary'),
    capabilityGap: markerValue(source, 'capability-gap'),
    removalTrigger: markerValue(source, 'removal-trigger'),
    revisitTrigger: markerValue(source, 'revisit-trigger'),
  };
}

export function validateControllerHopException(source = '') {
  const exception = parseControllerHopException(source);
  const errors = [];
  if (exception.schema !== CONTROLLER_HOP_EXCEPTION_SCHEMA) {
    errors.push(
      `controller-hop-exception must be ${CONTROLLER_HOP_EXCEPTION_SCHEMA}`
    );
  }
  if (!/^[A-Z][A-Za-z0-9-]+$/.test(exception.accountableWriter)) {
    errors.push('accountable-writer must name one owner');
  }
  if (
    !hasText(exception.trustBoundary, 20) &&
    !hasText(exception.capabilityGap, 20)
  ) {
    errors.push(
      'necessary-trust-boundary or capability-gap must explain the hop'
    );
  }
  if (
    !hasText(exception.removalTrigger, 20) &&
    !hasText(exception.revisitTrigger, 20)
  ) {
    errors.push('removal-trigger or revisit-trigger must be concrete');
  }
  return { ok: errors.length === 0, errors, exception };
}

export function validateControllerHopChanges(input = {}) {
  const {
    addedPaths = [],
    changedPaths = addedPaths,
    readBaseFile = _path => '',
    readFile = _path => '',
  } = input;
  const added = new Set(addedPaths);
  return [...new Set([...addedPaths, ...changedPaths])].sort().flatMap(path => {
    if (!WORKFLOW_FILE_RE.test(path)) return [];
    const source = String(readFile(path) ?? '');
    const currentFingerprints = new Set(
      controllerCapabilityFingerprints(source)
    );
    if (currentFingerprints.size === 0) return [];
    const baseFingerprints = added.has(path)
      ? new Set()
      : new Set(controllerCapabilityFingerprints(readBaseFile(path)));
    const introducedFingerprints = [...currentFingerprints].filter(
      fingerprint => !baseFingerprints.has(fingerprint)
    );
    if (introducedFingerprints.length === 0) return [];
    const validation = validateControllerHopException(source);
    return validation.ok
      ? []
      : [
          `${path}: new workflow/controller hop requires ${CONTROLLER_HOP_EXCEPTION_SCHEMA} with accountable writer, trust boundary or capability gap, and removal/revisit trigger (${validation.errors.join('; ')})`,
        ];
  });
}
