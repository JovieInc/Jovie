import { triage } from '../hooks/warden-triage.mjs';

// File metadata and hunk content can both start with +++ or ---. Only hunk
// boundaries distinguish them; count every +/- content line once inside one.
export function routeDiff(diff) {
  const files = [];
  let file;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
      if (!match)
        throw new Error('unsupported diff header for deterministic baseline');
      file = { path: match[2], oldPath: match[1], added: 0, deleted: 0 };
      files.push(file);
      inHunk = false;
    } else if (line.startsWith('@@ ')) {
      inHunk = true;
    } else if (file && inHunk && line.startsWith('+')) {
      file.added++;
    } else if (file && inHunk && line.startsWith('-')) {
      file.deleted++;
    }
  }
  if (!files.length)
    throw new Error('diff must enumerate files for routing baseline');
  return triage(files);
}
