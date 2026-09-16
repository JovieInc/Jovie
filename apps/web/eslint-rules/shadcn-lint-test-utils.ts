import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

export const WEB_ROOT = webRoot;
export const ESLINT_CONFIG_PATH = path.join(webRoot, 'eslint.config.js');
export const SHADCN_FIXTURES_DIR = path.join(
  webRoot,
  'eslint-rules',
  '__fixtures__',
  'shadcn-lint'
);

export function createShippedEslint(options?: {
  readonly ignore?: boolean;
}): ESLint {
  return new ESLint({
    cwd: webRoot,
    overrideConfigFile: ESLINT_CONFIG_PATH,
    ignore: options?.ignore ?? true,
  });
}

export async function lintShipped(
  filePath: string,
  options?: { readonly ignore?: boolean }
): Promise<readonly ESLint.LintResult[]> {
  const eslint = createShippedEslint(options);
  return eslint.lintFiles([filePath]);
}

export function restyleMessages(
  results: readonly ESLint.LintResult[]
): readonly ESLint.LintMessage[] {
  return results.flatMap(result =>
    result.messages.filter(message => message.ruleId === 'shadcn/no-restyle')
  );
}

export function formatMessages(
  messages: readonly ESLint.LintMessage[]
): readonly string[] {
  return messages.map(
    message =>
      `${message.ruleId ?? 'unknown'}: ${message.message} (${message.line}:${message.column})`
  );
}
