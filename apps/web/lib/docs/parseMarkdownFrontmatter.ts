export interface MarkdownFrontmatterResult {
  content: string;
  data: Record<string, string>;
}

const FRONTMATTER_REGEX = /^--- *\n([\s\S]*?)\n--- *(?:\n|$)/;

function frontmatterError(sourcePath: string, message: string): Error {
  return new Error(`Invalid frontmatter in ${sourcePath}: ${message}`);
}

export function parseMarkdownFrontmatter(
  raw: string,
  sourcePath = '<markdown>'
): MarkdownFrontmatterResult {
  const safeRaw = raw.slice(0, 100000);
  const match = FRONTMATTER_REGEX.exec(safeRaw);
  if (!match) {
    return {
      content: raw,
      data: {},
    };
  }

  const frontmatter = match[1];
  const data: Record<string, string> = {};

  frontmatter.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const lineNumber = index + 2;
    if (/^\s/.test(line)) {
      throw frontmatterError(
        sourcePath,
        `nested or multiline YAML is not supported (line ${lineNumber})`
      );
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      throw frontmatterError(
        sourcePath,
        `expected "key: value" on line ${lineNumber}`
      );
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      throw frontmatterError(
        sourcePath,
        `invalid field name on line ${lineNumber}`
      );
    }
    if (Object.hasOwn(data, key)) {
      throw frontmatterError(sourcePath, `duplicate field ${key}`);
    }

    data[key] = value.replaceAll(/(^['"])|(["']$)/g, '');
  });

  return {
    content: raw.slice(match[0].length),
    data,
  };
}
