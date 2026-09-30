import { type CopyFinding, lintCopy } from '@jovie/copy';
import { getRoutedSolutionsPages } from '@/content/pages/solutions';
import type { Claim } from '@/data/product-truth/registry';
import {
  getMarketingPageContractForPathname,
  MARKETING_PAGE_CONTRACTS,
  type MarketingPageContract,
  normalizeMarketingPathname,
} from '../pageContracts';
import type { HeroVariantName } from './heroDecision';
import {
  findPageRecordTermViolations,
  type PageRecord,
  type PageRecordFamily,
  type PageRecordTermViolation,
  pageRecordPath,
  pageRecordTermPolicy,
  resolvePageCopy,
} from './pageRecord';

/**
 * Per-record page contracts (JOV-7283). A family route's glob contract in
 * pageContracts.ts is only the fallback; every routed record gets its own
 * contract derived from `record.brief` (audience, job, success event,
 * language scope, allowed and forbidden terms). Consumers (contract markers,
 * copy gate, source invariants, hero audit, seo:certify) resolve
 * `/<family>/<slug>` here.
 *
 * Server-side only: it imports the records, which pull their copy sources.
 * Client code receives a derived contract as a prop.
 */

export interface PageRecordPageContract extends MarketingPageContract {
  readonly url: string;
  readonly recordId: string;
  readonly audience: string;
  readonly heroVariant: HeroVariantName;
  /** Terms the record's rendered copy may not use. */
  readonly forbiddenTerms: readonly string[];
  /** Scope-forbidden terms the brief explicitly allows. */
  readonly allowedTerms: readonly string[];
}

/** Every routed record, across families. */
export function getRoutedPageRecords(): readonly PageRecord[] {
  return getRoutedSolutionsPages();
}

function familyGlobContract(family: PageRecordFamily): MarketingPageContract {
  const contract = Object.values(MARKETING_PAGE_CONTRACTS).find(
    (candidate: MarketingPageContract) => candidate.recordFamily === family
  );
  if (!contract) {
    throw new Error(`No glob page contract declares recordFamily ${family}`);
  }
  return contract;
}

/** The record's contract: brief-derived fields over the family fallback. */
export function derivePageRecordContract(
  record: PageRecord
): PageRecordPageContract {
  const family = familyGlobContract(record.family);
  const policy = pageRecordTermPolicy(record.brief);
  return {
    routeGlob: family.routeGlob,
    url: pageRecordPath(record),
    copyScope: policy.copyScope,
    job: record.brief.job,
    proof: family.proof,
    successEvent: record.brief.successEvent,
    primaryCta: family.primaryCta,
    recordFamily: record.family,
    recordId: record.id,
    audience: record.brief.audience,
    heroVariant: record.heroVariant,
    forbiddenTerms: policy.forbidden,
    allowedTerms: policy.allowed,
  };
}

export function getPageRecordContracts(
  records: readonly PageRecord[] = getRoutedPageRecords()
): readonly PageRecordPageContract[] {
  return records.map(derivePageRecordContract);
}

/**
 * The contract for a pathname: a routed record's own contract when one
 * matches, else the static glob contract. A family glob never answers for a
 * record path, and never for a slug with no routed record.
 */
export function resolveMarketingPageContract(
  pathname: string | null | undefined,
  records: readonly PageRecord[] = getRoutedPageRecords()
): MarketingPageContract | null {
  const normalized = normalizeMarketingPathname(pathname);
  if (!normalized) return null;
  const record = records.find(r => pageRecordPath(r) === normalized);
  if (record) return derivePageRecordContract(record);
  const contract = getMarketingPageContractForPathname(normalized);
  return contract?.recordFamily ? null : contract;
}

/** Concrete paths of routed records, keyed by their family glob url. */
export function pageRecordPathsByFamilyUrl(
  records: readonly PageRecord[] = getRoutedPageRecords()
): ReadonlyMap<string, readonly string[]> {
  const byUrl = new Map<string, string[]>();
  for (const record of records) {
    const { url } = familyGlobContract(record.family);
    byUrl.set(url, [...(byUrl.get(url) ?? []), pageRecordPath(record)]);
  }
  return byUrl;
}

export interface PageRecordCopyGateResult {
  readonly ok: boolean;
  /** Blocking @jovie/copy findings on the record's resolved copy. */
  readonly lint: readonly CopyFinding[];
  /** Record strings outside the brief's language scope. */
  readonly scope: readonly PageRecordTermViolation[];
}

/**
 * Copy gate for one record: the jovie-marketing register (content/ path
 * register) over every record-owned string, plus the per-record scope.
 */
export function gatePageRecordCopy(
  record: PageRecord,
  claims: readonly Claim[]
): PageRecordCopyGateResult {
  const texts = [
    ...Object.values(resolvePageCopy(record, claims)),
    record.seo.title,
    record.seo.socialTitle,
    record.seo.description,
    ...record.seo.faq.flatMap(entry => [entry.question, entry.answer]),
  ].filter((text): text is string => typeof text === 'string');
  const lint = texts.flatMap(
    text => lintCopy(text, { register: 'jovie-marketing' }).blocking
  );
  const scope = findPageRecordTermViolations(record, claims);
  return { ok: lint.length === 0 && scope.length === 0, lint, scope };
}
