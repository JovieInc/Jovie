export function parseCodeownersPatterns(content) {
  const patterns = [];
  for (const [index, line] of String(content ?? '')
    .split('\n')
    .entries()) {
    const code = line.split('#')[0].trim();
    if (!code) continue;
    const [pattern] = code.split(/\s+/);
    if (!pattern || pattern.startsWith('#')) continue;
    patterns.push({ pattern, line: index + 1 });
  }
  return patterns;
}

function patternRegExp(pattern) {
  const anchored =
    pattern.startsWith('/') || pattern.slice(0, -1).includes('/');
  let body = pattern.replace(/^\//, '').replace(/\/$/, '');
  body = body
    .split('**/')
    .map(segment =>
      segment
        .split('**')
        .map(part =>
          part
            .split('*')
            .map(token =>
              token
                .split('?')
                .map(text => text.replace(/[.+^${}()|]/g, '\\$&'))
                .join('[^/]')
            )
            .join('[^/]*')
        )
        .join('.*')
    )
    .join('(?:.*/)?');
  return new RegExp(`${anchored ? '^' : '(^|/)'}${body}(/|$)`);
}

export function patternMatchesPath(pattern, file) {
  if (typeof pattern !== 'string' || typeof file !== 'string') return false;
  if (/[!\[\]\\]/.test(pattern)) return false;
  return patternRegExp(pattern).test(file);
}

export function unmatchedCodeownersPatterns(content, files) {
  const tracked = files ?? [];
  return parseCodeownersPatterns(content).flatMap(entry => {
    if (/[!\[\]\\]/.test(entry.pattern)) {
      return [{ ...entry, reason: 'unsupported-syntax' }];
    }
    const matched = tracked.some(file =>
      patternMatchesPath(entry.pattern, file)
    );
    return matched ? [] : [{ ...entry, reason: 'no-tracked-file' }];
  });
}
