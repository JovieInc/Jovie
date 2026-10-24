'use client';

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import type { Components } from 'streamdown';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';
import {
  projectPublicEnrichedFacts,
  publicSourceUrl,
} from '@/lib/profile-facts/enrichment';
import { sourceFactLabel, sourceMetricLabels } from '../source-facts';
import { EntityChipPopover } from './EntityChipPopover';
import { EntityMentionSpan } from './EntityMentionSpan';

const SourceEvidenceContext = createContext<readonly EnrichedFact[]>([]);
// Streamdown accepts both intrinsic HTML props and custom-element records.
type SourceMarkdownProps =
  | { readonly children?: unknown; readonly href?: unknown }
  | Record<string, unknown>;

export function SourceEvidenceProvider({
  facts,
  children,
}: {
  readonly facts: readonly EnrichedFact[];
  readonly children: ReactNode;
}) {
  const publicFacts = useMemo(
    () =>
      facts[0] ? projectPublicEnrichedFacts(facts, facts[0].subject.id) : [],
    [facts]
  );
  return (
    <SourceEvidenceContext.Provider value={publicFacts}>
      {children}
    </SourceEvidenceContext.Provider>
  );
}

function SourceMention({
  fact,
  children,
}: {
  readonly fact: EnrichedFact;
  readonly children: ReactNode;
}) {
  return (
    <EntityChipPopover
      kind='artist'
      id={fact.id}
      label='Inspect Source'
      sourceFact={fact}
    >
      <EntityMentionSpan kind='artist' label={children} />
    </EntityChipPopover>
  );
}

/** Match complete, unambiguous typed values. Never make a number alone clickable. */
function enrichText(text: string, facts: readonly EnrichedFact[]): ReactNode {
  const labels = facts.flatMap(fact =>
    sourceMetricLabels(fact).map(label => ({ fact, label }))
  );
  const candidates = labels.filter(
    entry => labels.filter(other => other.label === entry.label).length === 1
  );
  const nodes: ReactNode[] = [];
  let offset = 0;
  while (offset < text.length) {
    const match = candidates
      .map(entry => ({ ...entry, index: text.indexOf(entry.label, offset) }))
      .filter(
        entry =>
          entry.index >= 0 &&
          !/[\p{L}\p{N}]/u.test(text[entry.index - 1] ?? '') &&
          !/[\p{L}\p{N}]/u.test(text[entry.index + entry.label.length] ?? '')
      )
      .sort((a, b) => a.index - b.index)[0];
    if (!match) {
      nodes.push(text.slice(offset));
      break;
    }
    nodes.push(text.slice(offset, match.index));
    nodes.push(
      <SourceMention key={`${match.fact.id}:${match.index}`} fact={match.fact}>
        {match.label}
      </SourceMention>
    );
    offset = match.index + match.label.length;
  }
  return nodes;
}

function enrichChildren(
  children: ReactNode,
  facts: readonly EnrichedFact[]
): ReactNode {
  return Children.map(children, child => {
    if (typeof child === 'string') return enrichText(child, facts);
    if (!isValidElement<{ children?: ReactNode }>(child)) return child;
    if (
      typeof child.type !== 'string' ||
      ['a', 'code', 'pre', 'button'].includes(child.type)
    )
      return child;
    return cloneElement(child, {}, enrichChildren(child.props.children, facts));
  });
}

function SourceParagraph({ children }: SourceMarkdownProps) {
  const facts = useContext(SourceEvidenceContext);
  return <p>{enrichChildren(children as ReactNode, facts)}</p>;
}
function InlineSourceParagraph({ children }: SourceMarkdownProps) {
  const facts = useContext(SourceEvidenceContext);
  return <span>{enrichChildren(children as ReactNode, facts)}</span>;
}
function SourceListItem({ children }: SourceMarkdownProps) {
  const facts = useContext(SourceEvidenceContext);
  return <li>{enrichChildren(children as ReactNode, facts)}</li>;
}
function SourceStrong({ children }: SourceMarkdownProps) {
  const facts = useContext(SourceEvidenceContext);
  return <strong>{enrichChildren(children as ReactNode, facts)}</strong>;
}
function SourceEmphasis({ children }: SourceMarkdownProps) {
  const facts = useContext(SourceEvidenceContext);
  return <em>{enrichChildren(children as ReactNode, facts)}</em>;
}
function SourceAnchor({
  href: rawHref,
  children,
}: SourceMarkdownProps): ReactElement {
  const href = typeof rawHref === 'string' ? rawHref : undefined;
  const facts = useContext(SourceEvidenceContext);
  const safe = publicSourceUrl(href ?? null);
  const fact = safe
    ? facts.find(candidate =>
        candidate.sourceRefs.some(
          ref =>
            ref.status === 'available' &&
            (ref.url === safe || ref.originUrl === safe)
        )
      )
    : undefined;
  if (fact)
    return (
      <SourceMention fact={fact}>
        {fact.value
          ? fact.value.type === 'text'
            ? fact.value.value
            : children === sourceFactLabel(fact)
              ? sourceFactLabel(fact)
              : (fact.subject.displayName ?? 'Source details')
          : 'Source unavailable'}
      </SourceMention>
    );
  return (
    <a href={href} target='_blank' rel='noopener noreferrer'>
      {children as ReactNode}
    </a>
  );
}

export const SOURCE_MARKDOWN_COMPONENTS: Components = {
  a: SourceAnchor,
  p: SourceParagraph,
  li: SourceListItem,
  strong: SourceStrong,
  em: SourceEmphasis,
};
export const INLINE_SOURCE_MARKDOWN_COMPONENTS: Components = {
  ...SOURCE_MARKDOWN_COMPONENTS,
  p: InlineSourceParagraph,
};
