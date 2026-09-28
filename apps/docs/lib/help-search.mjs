export const HELP_CATEGORIES = Object.freeze([
  {
    id: 'jovie-essentials',
    label: 'Jovie essentials',
    terms: ['start', 'find', 'claim', 'sign in', 'log in', 'connect'],
  },
  {
    id: 'build-your-presence',
    label: 'Build your presence',
    terms: ['profile', 'release', 'smart link', 'publish', 'share', 'music'],
  },
  {
    id: 'manage-jovie',
    label: 'Manage Jovie',
    terms: [
      'billing',
      'cancel',
      'invoice',
      'privacy',
      'delete',
      'wrong',
      'support',
    ],
  },
  {
    id: 'developers',
    label: 'Developers',
    terms: ['api', 'openapi', 'endpoint', 'json', 'developer'],
  },
]);

export function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tagName = 'tagName' in target ? String(target.tagName) : '';
  return (
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName) ||
    ('isContentEditable' in target && target.isContentEditable === true)
  );
}

export function isSearchShortcut(event, platform = '') {
  const key = event.key.toLowerCase();
  if (key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    return 'slash';
  }
  const commandKey = platform.includes('Mac') ? event.metaKey : event.ctrlKey;
  if (key === 'k' && commandKey && !event.shiftKey && !event.altKey) {
    return 'command';
  }
  return null;
}

export function excerptSegments(excerpt) {
  const normalized = String(excerpt ?? '')
    .replace(/<\s*mark(?:\s[^>]*)?>/gi, '\u0000')
    .replace(/<\s*\/\s*mark\s*>/gi, '\u0001')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const segments = [];
  let highlighted = false;
  let offset = 0;
  for (const value of normalized.split(/([\u0000\u0001])/)) {
    if (value === '\u0000') highlighted = true;
    else if (value === '\u0001') highlighted = false;
    else if (value) {
      segments.push({ value, highlighted, offset });
      offset += value.length;
    }
  }
  return segments;
}

export function highlightedText(text, query) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(term => term.length > 1)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return [{ value: text, highlighted: false, offset: 0 }];
  const matcher = new RegExp(`(${terms.join('|')})`, 'gi');
  let offset = 0;
  return text
    .split(matcher)
    .filter(Boolean)
    .map(value => {
      const segment = {
        value,
        highlighted: matcher.test(value),
        offset,
      };
      matcher.lastIndex = 0;
      offset += value.length;
      return segment;
    });
}

export function categoryLabel(category) {
  return (
    HELP_CATEGORIES.find(candidate => candidate.id === category)?.label ??
    'Help Center'
  );
}

export function relevantCategories(query, limit = 3) {
  const normalized = query.trim().toLowerCase();
  return HELP_CATEGORIES.map((category, index) => ({
    ...category,
    score: category.terms.reduce(
      (score, term) => score + (normalized.includes(term) ? 1 : 0),
      0
    ),
    index,
  }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);
}

export function resultUrl(url, query) {
  const [pathAndQuery, hash = ''] = url.replace(/\.html(?=#|$)/, '').split('#');
  const result = new URL(pathAndQuery, 'https://docs.jov.ie');
  result.searchParams.set('search', query);
  const relative = `${result.pathname}${result.search}${hash ? `#${hash}` : ''}`;
  return relative;
}

export function supportUrl(query, source = 'help-search-zero-results') {
  const url = new URL('https://jov.ie/support');
  url.searchParams.set('query', query);
  url.searchParams.set('source', source);
  return url.toString();
}
