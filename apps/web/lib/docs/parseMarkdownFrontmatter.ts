export interface MarkdownFrontmatterResult {
  content: string;
  data: Record<string, string>;
}

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

export function parseMarkdownFrontmatter(
  raw: string
): MarkdownFrontmatterResult {
  const safeRaw = raw.slice(0, 100000);
  const match = safeRaw.match(FRONTMATTER_REGEX);
  if (!match) {
    return {
      content: raw,
      data: {},
    };
  }

  const frontmatter = match[1];
  const data: Record<string, string> = {};

  frontmatter.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key) return;

    data[key] = value.replaceAll(/(^['"])|(["']$)/g, '');
  });

  return {
    content: raw.slice(match[0].length),
    data,
  };
}
