// Prose-only view of a PR body: fenced blocks and inline code removed (moved out of pr-open.mjs).
// scrubPrText strips secrets and personal data from PR text (canon/FLEET.md#routine-writes).
export { scrubPrText } from '../secrets/redact.mjs';
export function proseOnly(body) {
  let fence = '';
  return body
    .split('\n')
    .map(line => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length
        )
          fence = '';
        return '';
      }
      if (marker) {
        fence = marker[1];
        return '';
      }
      return line.replace(/(`+)([\s\S]*?)\1(?!`)/g, '');
    })
    .join('\n');
}
