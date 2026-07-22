export interface SourceFixture {
  readonly path: string;
  readonly source: string;
}

function skipQuotedValue(source: string, start: number): number {
  const quote = source[start];
  let cursor = start + 1;

  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }

  return source.length;
}

function findClosingDelimiter(
  source: string,
  start: number,
  open: string,
  close: string
): number {
  let depth = 0;

  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '"' || character === "'" || character === '`') {
      cursor = skipQuotedValue(source, cursor) - 1;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth === 0) return cursor;
  }

  return -1;
}

function readJsxOpeningTag(source: string, start: number): string | null {
  let braceDepth = 0;

  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '"' || character === "'" || character === '`') {
      cursor = skipQuotedValue(source, cursor) - 1;
      continue;
    }
    if (character === '{') braceDepth += 1;
    if (character === '}') braceDepth -= 1;
    if (character === '>' && braceDepth === 0) {
      return source.slice(start, cursor + 1);
    }
  }

  return null;
}

function getAttributeExpression(
  openingTag: string,
  attribute: 'start' | 'end'
): string | null {
  const match = new RegExp(`\\b${attribute}\\s*=\\s*\\{`).exec(openingTag);
  if (!match) return null;

  const openBrace = match.index + match[0].lastIndexOf('{');
  const closeBrace = findClosingDelimiter(openingTag, openBrace, '{', '}');
  if (closeBrace === -1) return null;

  return openingTag.slice(openBrace + 1, closeBrace).trim();
}

function resolveConstInitializer(
  source: string,
  identifier: string,
  beforeIndex: number
): string | null {
  const declaration = new RegExp(`\\bconst\\s+${identifier}\\s*=`, 'g');
  let initializerStart = -1;
  let match: RegExpExecArray | null;

  while ((match = declaration.exec(source)) !== null) {
    if (match.index >= beforeIndex) break;
    initializerStart = match.index + match[0].length;
  }

  if (initializerStart === -1) return null;

  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  for (let cursor = initializerStart; cursor < beforeIndex; cursor += 1) {
    const character = source[cursor];
    if (character === '"' || character === "'" || character === '`') {
      cursor = skipQuotedValue(source, cursor) - 1;
      continue;
    }
    if (character === '{') braces += 1;
    if (character === '}') braces -= 1;
    if (character === '[') brackets += 1;
    if (character === ']') brackets -= 1;
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses -= 1;
    if (
      character === ';' &&
      braces === 0 &&
      brackets === 0 &&
      parentheses === 0
    ) {
      return source.slice(initializerStart, cursor).trim();
    }
  }

  return null;
}

const PRIMARY_BUTTON_VARIANTS = new Set([
  'primary',
  'accent',
  'destructive',
  'whitePill',
]);

function isPrimaryButton(openingTag: string): boolean {
  const quotedVariant =
    /\bvariant\s*=\s*'([^']+)'/.exec(openingTag)?.[1] ??
    /\bvariant\s*=\s*"([^"]+)"/.exec(openingTag)?.[1];
  if (quotedVariant) return PRIMARY_BUTTON_VARIANTS.has(quotedVariant);

  const expressionMatch = /\bvariant\s*=\s*\{/.exec(openingTag);
  if (!expressionMatch) return true;

  const openBrace = expressionMatch.index + expressionMatch[0].lastIndexOf('{');
  const closeBrace = findClosingDelimiter(openingTag, openBrace, '{', '}');
  if (closeBrace === -1) return true;

  const expression = openingTag.slice(openBrace + 1, closeBrace);
  const literalVariants = [...expression.matchAll(/['"]([A-Za-z-]+)['"]/g)].map(
    match => match[1]
  );

  return (
    literalVariants.length === 0 ||
    literalVariants.some(variant => PRIMARY_BUTTON_VARIANTS.has(variant))
  );
}

export function countPrimaryPillButtons(source: string): number {
  let count = 0;
  let cursor = 0;

  while ((cursor = source.indexOf('<Button', cursor)) !== -1) {
    const boundary = source[cursor + '<Button'.length];
    if (boundary && !/[\s/>]/.test(boundary)) {
      cursor += '<Button'.length;
      continue;
    }

    const openingTag = readJsxOpeningTag(source, cursor);
    if (!openingTag) break;
    if (isPrimaryButton(openingTag)) count += 1;
    cursor += openingTag.length;
  }

  return count;
}

export function findPageToolbarPrimaryCtaViolations(
  files: readonly SourceFixture[]
): string[] {
  const violations: string[] = [];

  for (const file of files) {
    let cursor = 0;
    while ((cursor = file.source.indexOf('<PageToolbar', cursor)) !== -1) {
      const boundary = file.source[cursor + '<PageToolbar'.length];
      if (boundary && !/[\s/>]/.test(boundary)) {
        cursor += '<PageToolbar'.length;
        continue;
      }

      const openingTag = readJsxOpeningTag(file.source, cursor);
      if (!openingTag) break;
      const primaryCount = (['start', 'end'] as const).reduce(
        (count, attribute) => {
          const expression = getAttributeExpression(openingTag, attribute);
          if (!expression) return count;

          const resolvedExpression = /^[A-Za-z_$][\w$]*$/.test(expression)
            ? resolveConstInitializer(file.source, expression, cursor)
            : expression;
          return (
            count +
            (resolvedExpression
              ? countPrimaryPillButtons(resolvedExpression)
              : 0)
          );
        },
        0
      );

      if (primaryCount > 1) {
        violations.push(
          `${file.path}: PageToolbar has ${primaryCount} primary pill CTAs (maximum 1)`
        );
      }

      cursor += openingTag.length;
    }
  }

  return violations;
}

export function isPageLevelRedirectStub(source: string): boolean {
  const invokesRedirect =
    /\bredirect\s*\(/.test(source) ||
    /\bpermanentRedirect\s*\(/.test(source) ||
    /\bredirectFromEarningsRoute\s*\(/.test(source);
  const defaultFunction = /\bexport\s+default\s+(?:async\s+)?function\b/.exec(
    source
  );
  let pageBody = source;
  if (defaultFunction) {
    const parameterStart = source.indexOf('(', defaultFunction.index);
    const parameterEnd =
      parameterStart === -1
        ? -1
        : findClosingDelimiter(source, parameterStart, '(', ')');
    const bodyStart =
      parameterEnd === -1 ? -1 : source.indexOf('{', parameterEnd);
    const bodyEnd =
      bodyStart === -1 ? -1 : findClosingDelimiter(source, bodyStart, '{', '}');
    if (bodyStart !== -1 && bodyEnd !== -1) {
      pageBody = source.slice(bodyStart + 1, bodyEnd);
    }
  }

  const returnsJsx = /\breturn\s*\(?\s*(?:<>|<[A-Za-z])/.test(pageBody);

  return invokesRedirect && !returnsJsx;
}

export function findNewRedirectStubPaths(
  files: readonly SourceFixture[],
  allowedPaths: ReadonlySet<string>
): string[] {
  return files
    .filter(file => isPageLevelRedirectStub(file.source))
    .map(file => file.path)
    .filter(path => !allowedPaths.has(path))
    .sort();
}

export function findNewEmptyStatePaths(
  paths: readonly string[],
  allowedPaths: ReadonlySet<string>
): string[] {
  return paths
    .filter(path => /(?:^|\/)[^/]*EmptyState\.tsx$/.test(path))
    .filter(path => !allowedPaths.has(path))
    .sort();
}
