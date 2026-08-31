// JOV-INV-022: reject new controller hops without a bounded exception.

export const CONTROLLER_HOP_INVARIANT_ID = 'JOV-INV-022';
export const CONTROLLER_HOP_EXCEPTION_SCHEMA = 'jovie-controller-hop/v1';

const WORKFLOW_FILE_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const CONTROLLER_SIGNAL_RE =
  /\b(workflow_run|pull_request_target|schedule|create-github-app-token|gh\s+(?:api|pr|issue)|pull-requests:\s*write|contents:\s*write|issues:\s*write)\b/;
const hasText = (value, minLength = 1) =>
  typeof value === 'string' && value.trim().length >= minLength;
const markerValue = (source, marker) =>
  source
    .match(new RegExp(`^\\s*#\\s*${marker}:\\s*(.+?)\\s*$`, 'mi'))?.[1]
    ?.trim() ?? '';

export const isControllerCapableWorkflow = (path, source = '') =>
  WORKFLOW_FILE_RE.test(path) && CONTROLLER_SIGNAL_RE.test(source);

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
  const { addedPaths = [], readFile = _path => '' } = input;
  return [...new Set(addedPaths)].sort().flatMap(path => {
    if (!WORKFLOW_FILE_RE.test(path)) return [];
    const source = String(readFile(path) ?? '');
    if (!isControllerCapableWorkflow(path, source)) return [];
    const validation = validateControllerHopException(source);
    return validation.ok
      ? []
      : [
          `${path}: new workflow/controller hop requires ${CONTROLLER_HOP_EXCEPTION_SCHEMA} with accountable writer, trust boundary or capability gap, and removal/revisit trigger (${validation.errors.join('; ')})`,
        ];
  });
}
