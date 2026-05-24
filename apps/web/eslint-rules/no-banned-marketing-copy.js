/**
 * ESLint rule to prevent banned copy terms from appearing on public marketing pages.
 *
 * Marketing pages must not contain internal/test copy, placeholder text,
 * or banned terms that would undermine product credibility.
 *
 * Bad:  "lorem ipsum dolor sit amet"
 * Bad:  "John Doe" (placeholder name)
 * Bad:  "waitlist" (unless allowlisted via inline comment)
 * Good: Verified, intentional product copy
 *
 * Allowlist inline exceptions with a JSX comment on the same line:
 *   {/* copy-lint-allow: waitlist used intentionally in analytics copy * /}
 * Or for JSX string literals:
 *   className="sr-only" // copy-lint-allow: lorem used in test fixture
 *
 * Scope: Only enforced in app/(marketing)/** files.
 */

// Terms that are always banned — internal, placeholder, or off-brand
const BANNED_TERMS = [
  {
    pattern: /\blorem\s+ipsum\b/i,
    name: 'lorem ipsum',
    message: 'Lorem ipsum placeholder text must not appear in marketing pages.',
  },
  {
    pattern: /\btest\s+song\b/i,
    name: 'test song',
    message:
      '"test song" is internal test copy and must not appear on public pages.',
  },
  {
    pattern: /\bfake\s+data\b/i,
    name: 'fake data',
    message:
      '"fake data" is internal copy and must not appear on public pages.',
  },
  {
    pattern: /\bplaceholder\b/i,
    name: 'placeholder',
    message:
      '"placeholder" in visible copy is likely test content. Remove it or use a copy-lint-allow comment if intentional.',
  },
  {
    pattern: /\bjohn\s+doe\b/i,
    name: 'John Doe',
    message:
      '"John Doe" is a placeholder name and must not appear on public pages. Use real creator names.',
  },
  {
    pattern: /\bjane\s+doe\b/i,
    name: 'Jane Doe',
    message:
      '"Jane Doe" is a placeholder name and must not appear on public pages.',
  },
  {
    pattern: /\bfoo\s+bar\b/i,
    name: 'foo bar',
    message:
      '"foo bar" is a test/placeholder string. Remove from marketing copy.',
  },
  {
    pattern: /\btest\s+user\b/i,
    name: 'test user',
    message: '"test user" is internal copy. Remove from marketing pages.',
  },
  {
    pattern: /\[your\s+name\]/i,
    name: '[your name]',
    message:
      'Unfilled template placeholder "[your name]" found in marketing copy.',
  },
  {
    pattern: /\[company\s+name\]/i,
    name: '[company name]',
    message:
      'Unfilled template placeholder "[company name]" found in marketing copy.',
  },
  {
    pattern: /\btodo[:\s]/i,
    name: 'TODO',
    message:
      'TODO comment in JSX string will appear in rendered output. Remove from marketing copy.',
  },
];

// Terms that are banned unless an allowlist comment is present on the same line.
// These are context-sensitive — sometimes legitimate, sometimes not.
const SOFT_BANNED_TERMS = [
  {
    pattern: /\bwaitlist\b/i,
    name: 'waitlist',
    message:
      '"waitlist" should not appear on public marketing pages. If intentional, add a `copy-lint-allow: waitlist` comment on the same line.',
  },
  {
    pattern: /\bobjection\b/i,
    name: 'objection',
    message:
      '"objection" should not appear on marketing pages. If intentional, add a `copy-lint-allow: objection` comment on the same line.',
  },
  {
    pattern: /\bmanipulate\b/i,
    name: 'manipulate',
    message:
      '"manipulate" should not appear on marketing pages. If intentional, add a `copy-lint-allow: manipulate` comment on the same line.',
  },
  {
    pattern: /\binternal\s+note\b/i,
    name: 'internal note',
    message:
      '"internal note" should not appear on public marketing pages. If intentional, add a `copy-lint-allow: internal note` comment on the same line.',
  },
];

// Files this rule applies to — only marketing pages
const MARKETING_PATH_PATTERNS = [/app\/\(marketing\)\//, /app\/\(public\)\//];

// Always-allowed files (tests, data files, server-only logic)
const ALLOWED_PATH_FRAGMENTS = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  'eslint-rules/',
  '/data/',
  '/lib/',
  '/scripts/',
  '/types/',
  '__tests__/',
];

const ALLOWLIST_COMMENT_PATTERN = /copy-lint-allow:/i;

/**
 * Check if a node's value contains a banned term.
 * Returns null if clean, or { term, message } if banned.
 */
function findBannedTerm(value, includeHard = true, includeSoft = true) {
  if (typeof value !== 'string') return null;

  if (includeHard) {
    for (const term of BANNED_TERMS) {
      if (term.pattern.test(value)) {
        return { term: term.name, message: term.message, isSoft: false };
      }
    }
  }

  if (includeSoft) {
    for (const term of SOFT_BANNED_TERMS) {
      if (term.pattern.test(value)) {
        return { term: term.name, message: term.message, isSoft: true };
      }
    }
  }

  return null;
}

/**
 * Check if a comment on the same line allowlists the term.
 */
function hasAllowlistComment(node, context, termName) {
  const sourceCode = context.sourceCode || context.getSourceCode();
  const comments = sourceCode.getAllComments ? sourceCode.getAllComments() : [];
  const nodeLine = node.loc?.start?.line;
  if (nodeLine == null) return false;

  return comments.some(comment => {
    const commentLine = comment.loc?.start?.line;
    if (commentLine == null) return false;
    // Comment must be on the same line or immediately before
    if (commentLine !== nodeLine && commentLine !== nodeLine - 1) return false;
    if (!ALLOWLIST_COMMENT_PATTERN.test(comment.value)) return false;
    // Check if the term is mentioned in the allowlist comment
    return comment.value.toLowerCase().includes(termName.toLowerCase());
  });
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow banned copy terms in marketing page JSX — prevents internal/placeholder text from reaching public pages',
      recommended: true,
    },
    messages: {
      bannedTerm:
        'Banned marketing copy detected: {{message}} To allow this, add `/* copy-lint-allow: {{term}} */` on the same line.',
    },
    schema: [],
  },

  create(context) {
    // Normalize path separators
    const filename = (context.filename || context.getFilename()).replaceAll(
      '\\',
      '/'
    );

    // Only apply to marketing pages
    const isMarketingPage = MARKETING_PATH_PATTERNS.some(pattern =>
      pattern.test(filename)
    );
    if (!isMarketingPage) return {};

    // Skip allowed files (tests, lib, data)
    if (ALLOWED_PATH_FRAGMENTS.some(fragment => filename.includes(fragment))) {
      return {};
    }

    function checkStringValue(node, value) {
      const found = findBannedTerm(value);
      if (!found) return;

      // Soft-banned terms respect allowlist comments
      if (found.isSoft && hasAllowlistComment(node, context, found.term)) {
        return;
      }

      context.report({
        node,
        messageId: 'bannedTerm',
        data: {
          message: found.message,
          term: found.term,
        },
      });
    }

    return {
      // String literals in JSX text and attributes
      Literal(node) {
        if (typeof node.value === 'string') {
          checkStringValue(node, node.value);
        }
      },

      // Template literals (e.g., `Hello ${name}, lorem ipsum...`)
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const cooked = quasi.value.cooked ?? '';
          if (cooked) {
            checkStringValue(quasi, cooked);
          }
        }
      },

      // JSX text nodes (between tags: <p>lorem ipsum</p>)
      JSXText(node) {
        checkStringValue(node, node.value);
      },
    };
  },
};
