function getFrontmatterBounds(content: string): { start: number; end: number } | null {
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return null;

  const fmEnd = content.indexOf('\n---', fmStart + 4);
  if (fmEnd === -1) return null;

  return { start: fmStart, end: fmEnd };
}

function parseVoiceTriggerValue(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

interface DescriptionField {
  readonly value: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

function readDescriptionField(frontmatter: string): DescriptionField | null {
  const lines = frontmatter.split('\n');
  let inDescription = false;
  let startIndex = -1;
  const valueLines: string[] = [];

  for (const [index, line] of lines.entries()) {
    if (!inDescription) {
      if (line.match(/^description:\s*\|?\s*$/)) {
        inDescription = true;
        startIndex = index;
        continue;
      }

      const inlineMatch = line.match(/^description:\s*(.+)$/);
      if (inlineMatch) {
        return {
          value: inlineMatch[1].trim(),
          startIndex: index,
          endIndex: index,
        };
      }

      continue;
    }

    if (line === '' || /^\s/.test(line)) {
      valueLines.push(line.replace(/^  /, ''));
      continue;
    }

    return {
      value: valueLines.join('\n').trim(),
      startIndex,
      endIndex: index - 1,
    };
  }

  if (!inDescription || startIndex === -1) {
    return null;
  }

  return {
    value: valueLines.join('\n').trim(),
    startIndex,
    endIndex: lines.length - 1,
  };
}

export function extractVoiceTriggers(content: string): string[] {
  const bounds = getFrontmatterBounds(content);
  if (!bounds) return [];

  const frontmatter = content.slice(bounds.start + 4, bounds.end);
  const triggers: string[] = [];
  const lines = frontmatter.split('\n');
  let inVoiceTriggers = false;

  for (const line of lines) {
    if (!inVoiceTriggers) {
      if (/^voice-triggers:\s*$/.test(line)) {
        inVoiceTriggers = true;
      }
      continue;
    }

    if (!/^\s/.test(line)) {
      break;
    }

    const match = line.match(/^\s*-\s+(.*)$/);
    if (!match) {
      continue;
    }

    const parsedValue = parseVoiceTriggerValue(match[1]);
    if (parsedValue) {
      triggers.push(parsedValue);
    }
  }

  return triggers;
}

export function stripVoiceTriggersBlock(content: string): string {
  const bounds = getFrontmatterBounds(content);
  if (!bounds) return content;

  const frontmatter = content.slice(bounds.start + 4, bounds.end);
  const lines = frontmatter.split('\n');
  const strippedLines: string[] = [];
  let inVoiceTriggers = false;

  for (const line of lines) {
    if (!inVoiceTriggers && /^voice-triggers:\s*$/.test(line)) {
      inVoiceTriggers = true;
      continue;
    }

    if (inVoiceTriggers) {
      if (!/^\s/.test(line)) {
        inVoiceTriggers = false;
      } else {
        continue;
      }
    }

    strippedLines.push(line);
  }

  return `${content.slice(0, bounds.start + 4)}${strippedLines.join('\n')}${content.slice(bounds.end)}`;
}

export function processVoiceTriggers(content: string): string {
  const triggers = extractVoiceTriggers(content);
  if (triggers.length === 0) return content;

  const strippedContent = stripVoiceTriggersBlock(content);
  const bounds = getFrontmatterBounds(strippedContent);
  if (!bounds) return strippedContent;

  const frontmatter = strippedContent.slice(bounds.start + 4, bounds.end);
  const descriptionField = readDescriptionField(frontmatter);
  if (!descriptionField) return strippedContent;

  const voiceLine = `Voice triggers (speech-to-text aliases): ${triggers.map(trigger => `"${trigger}"`).join(', ')}.`;
  const nextDescription = `${descriptionField.value}\n${voiceLine}`.trim();
  const updatedDescriptionLines = [
    'description: |',
    ...nextDescription.split('\n').map(line => `  ${line}`),
  ];

  const frontmatterLines = frontmatter.split('\n');
  frontmatterLines.splice(
    descriptionField.startIndex,
    descriptionField.endIndex - descriptionField.startIndex + 1,
    ...updatedDescriptionLines
  );

  return `${strippedContent.slice(0, bounds.start + 4)}${frontmatterLines.join('\n')}${strippedContent.slice(bounds.end)}`;
}
