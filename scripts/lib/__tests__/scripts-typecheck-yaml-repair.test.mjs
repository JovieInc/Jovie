import { describe, expect, it } from 'vitest';
import { unknownJsonPropertyRepair } from '../../typecheck-scripts.mjs';

describe('scripts-typecheck: js-yaml unknown repair', () => {
  it('names loadWorkflowYaml when the cited file imports js-yaml and does not call json()', () => {
    /** @type {(path: string) => string} */
    const read = () =>
      "import { load } from 'js-yaml';\nconst workflow = load('a: 1');\n";
    const message = unknownJsonPropertyRepair(
      [
        "scripts/lib/__tests__/web-build-workflow-contract.test.mjs(12,23): error TS2339: Property 'jobs' does not exist on type 'unknown'.",
      ],
      read
    );
    expect(message).toContain('loadWorkflowYaml');
    expect(message).toContain('scripts/lib/queue-parity.mjs');
    expect(message).not.toContain('response.json()');
  });
});
