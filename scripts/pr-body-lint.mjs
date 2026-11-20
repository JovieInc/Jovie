// The one PR-body check: `pnpm pr:open` enforces it before any GitHub write,
// and the advisory PR-body lint lane runs the same implementation. The rules
// themselves are not copied here — evaluateFleetRules (scripts/pr-fleet-rules.mjs)
// stays the server-side authority and is used as-is.
import { proseOnly } from './lib/pr-prose.mjs';
import { lintPrBody } from './lib/preflight-changed.mjs';
import { evaluateFleetRules } from './pr-fleet-rules.mjs';

export const PR_URL_PLACEHOLDER = '<PR URL, set after open>';

/** @param {{ title: string, body: string, labels?: string[], files: Array<{ filename: string, status?: string, patch?: string, previous_filename?: string }>, extra?: string[] }} input */
export function gate({ title, body, labels = [], files, extra = [] }) {
  const lint = lintPrBody({ body, title, labels, files, evaluateFleetRules });
  const errors = [
    ...lint.errors.map(e => e.message),
    ...extra,
    ...[...proseOnly(body).matchAll(/<[^<>\n]{3,}>/g)]
      .map(m => m[0])
      .filter(
        t =>
          t !== PR_URL_PLACEHOLDER &&
          !/^<(?:!--|\/?(?:details|summary|br|hr|p|a|img|code|pre|kbd|sub|sup|b|i|em|strong|ul|ol|li|table|thead|tbody|tr|td|th|div|span)(?:\s[^>]*)?\/?>)/.test(
            t
          ) &&
          !/^<https?:/.test(t)
      )
      .map(t => `placeholder: replace ${t} with real content`),
  ];
  return { errors, warnings: lint.warnings.map(w => w.message) };
}
