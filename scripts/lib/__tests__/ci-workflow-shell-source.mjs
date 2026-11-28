import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CI_SHELL_STEP =
  /^(?<indent> {8})run: (?<anchor>&[\w-]+ )?exec bash (?:--noprofile --norc -eo pipefail|-e) "\$GITHUB_WORKSPACE\/(?<script>\.github\/scripts\/ci\/[\w-]+\.sh)"$/gm;

/**
 * Give existing shell and fixture assertions the behavior they exercised
 * when these step programs were embedded. Graph and size assertions should
 * read the original YAML, including the executable step declarations.
 * @param {string | URL} workflowPath
 */
export function readCiWorkflowShellSource(workflowPath) {
  const source = readFileSync(workflowPath, 'utf8');
  const filename =
    workflowPath instanceof URL ? fileURLToPath(workflowPath) : workflowPath;
  const root = resolve(dirname(filename), '../..');
  return source.replaceAll(CI_SHELL_STEP, (...parts) => {
    const { indent, anchor = '', script } = parts.at(-1);
    const file = readFileSync(resolve(root, script), 'utf8');
    const body = file.replace(/^#![^\n]*\n/, '').trimEnd();
    const lines = body
      .split('\n')
      .map(line => (line ? `${indent}  ${line}` : ''));
    return `${indent}run: ${anchor}|\n${lines.join('\n')}`;
  });
}
