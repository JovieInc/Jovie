import { articleMetadataError } from './article-metadata.mjs';

const HELP_ARTICLE_OPEN_RE = /^\s*<HelpArticle\s+id="([^"]+)"/;

function blockContents(body, tag) {
  const open = body.indexOf(`<${tag}>`);
  const close = body.indexOf(`</${tag}>`);
  if (open === -1 || close === -1 || close < open) return null;
  return body.slice(open + tag.length + 2, close);
}

/**
 * Enforces the canonical task-guide anatomy on `documentType: guide` bodies.
 * Reference, landing, and legacy documents share the typography primitives but
 * are free-form and intentionally not checked here.
 */
export function validateArticleStructure(
  body,
  metadata,
  { sourcePath = '<article>' } = {}
) {
  const errors = [];
  const wrapper = body.match(HELP_ARTICLE_OPEN_RE);

  if (!wrapper) {
    errors.push('guide body must open with <HelpArticle id="...">');
  } else if (wrapper[1] !== metadata.id) {
    errors.push(
      `HelpArticle id "${wrapper[1]}" must match frontmatter id "${metadata.id}"`
    );
  }
  if (!body.trimEnd().endsWith('</HelpArticle>')) {
    errors.push('guide body must close with </HelpArticle>');
  }

  const sequence = [];
  const eventRe = /<Help([A-Za-z]+)|^# .+$|^## What happens next$/gm;
  for (const match of body.matchAll(eventRe)) {
    if (match[1]) sequence.push(`Help${match[1]}`);
    else if (match[0].startsWith('## ')) sequence.push('what-happens-next');
    else sequence.push('title');
  }

  const expect = [
    'HelpArticle',
    'title',
    'HelpOutcome',
    'HelpSteps',
    'what-happens-next',
    'HelpRelatedGuides',
    'HelpFeedback',
  ];
  let cursor = 0;
  for (const required of expect) {
    const index = sequence.indexOf(required, cursor);
    if (index === -1) {
      const label =
        required === 'title'
          ? '# <title>'
          : required === 'what-happens-next'
            ? '## What happens next'
            : `<${required}>`;
      errors.push(`missing or out-of-order canonical section: ${label}`);
    } else {
      cursor = index;
    }
  }

  const optionalBefore = ['HelpPrerequisites'];
  for (const tag of optionalBefore) {
    const index = sequence.indexOf(tag);
    if (index !== -1 && index > sequence.indexOf('HelpSteps')) {
      errors.push(`<${tag}> must appear before <HelpSteps>`);
    }
  }
  const troubleshootingIndex = sequence.indexOf('HelpTroubleshooting');
  if (
    troubleshootingIndex !== -1 &&
    (troubleshootingIndex < sequence.indexOf('what-happens-next') ||
      troubleshootingIndex > sequence.indexOf('HelpRelatedGuides'))
  ) {
    errors.push(
      '<HelpTroubleshooting> must appear between "## What happens next" and <HelpRelatedGuides>'
    );
  }
  const contactIndex = sequence.indexOf('HelpContactPanel');
  if (contactIndex !== -1 && contactIndex > sequence.indexOf('HelpFeedback')) {
    errors.push('<HelpContactPanel> must appear before <HelpFeedback>');
  }

  const stepsBlock = blockContents(body, 'HelpSteps');
  if (stepsBlock !== null) {
    const stepCount = (stepsBlock.match(/<HelpStep\b/g) ?? []).length;
    if (stepCount < 3 || stepCount > 7) {
      errors.push(
        `HelpSteps must contain 3-7 HelpStep entries (found ${stepCount})`
      );
    }
  }

  const mediaCount = (body.match(/<Help(?:Screenshot|Video)\b/g) ?? []).length;
  if (mediaCount === 0) {
    errors.push(
      'guides require at least one <HelpScreenshot> or <HelpVideo> visual proof'
    );
  }

  const troubleshootingBlock = blockContents(body, 'HelpTroubleshooting');
  if (troubleshootingBlock !== null) {
    const caseCount = (troubleshootingBlock.match(/^### .+$/gm) ?? []).length;
    if (caseCount < 2 || caseCount > 3) {
      errors.push(
        `HelpTroubleshooting must contain 2-3 failure cases (found ${caseCount})`
      );
    }
  }

  if (errors.length > 0) throw articleMetadataError(sourcePath, errors);
  return body;
}
