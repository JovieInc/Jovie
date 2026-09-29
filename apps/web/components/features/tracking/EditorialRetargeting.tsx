'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { MetaPixel } from '@/components/features/tracking/MetaPixel';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import {
  buildEditorialRetargetingEventFields,
  EDITORIAL_RETARGETING_EVENT,
  type EditorialRetargetingEntry,
  type EditorialRetargetingState,
  findEditorialRetargetingEntry,
  hasSensitiveQueryParams,
  resolveEditorialRetargetingState,
} from '@/lib/retargeting/editorial';
import {
  ensureFbqStub,
  type Fbq,
  useMarketingConsent,
} from '@/lib/tracking/use-marketing-consent';

interface EditorialRetargetingProps {
  /** Registered approved editorial routes from buildEditorialRetargetingRegistry. */
  readonly entries: readonly EditorialRetargetingEntry[];
  /** Jovie platform pixel id (server env passed in by the page). */
  readonly pixelId?: string;
}

/**
 * Consented public-article retargeting adapter (JOV-6289).
 *
 * Fails closed on every axis: the route must be an explicitly approved,
 * published, paid-promotion-authorized editorial canonical path; the live URL
 * must carry no sensitive query parameters; marketing consent must allow it
 * (GPC/DNT and consent-region policy are honored inside isMarketingAllowed);
 * and demo/test runtimes emit nothing. Private surfaces never mount this
 * component because no private route can appear in the registry.
 *
 * Emits a single Meta custom event with three non-sensitive fields
 * (canonical path, content revision, derivative id). No investor identity,
 * email, token, referrer, or full URL ever leaves this component.
 */
export function EditorialRetargeting({
  entries,
  pixelId,
}: EditorialRetargetingProps) {
  const pathname = usePathname();
  const entry = findEditorialRetargetingEntry(pathname, entries);
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDemo = isDemoRecordingClient();
  const skipConsent = !pixelId || isPassive || !entry || isDemo;
  const allowed = useMarketingConsent(skipConsent);

  const state: EditorialRetargetingState = resolveEditorialRetargetingState({
    hasPixelId: Boolean(pixelId),
    isPassive,
    entry,
    hasSensitiveQuery:
      globalThis.window === undefined
        ? false
        : hasSensitiveQueryParams(globalThis.location.search),
    isDemo,
    hasMarketingConsent: allowed,
  });

  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root) return;

    root.dataset.editorialRetargeting = state;
    return () => {
      if (root.dataset.editorialRetargeting === state) {
        delete root.dataset.editorialRetargeting;
      }
    };
  }, [state]);

  useEffect(() => {
    if (state !== 'eligible' || !entry) return;
    if (globalThis.window === undefined) return;

    // MetaPixel installs the fbq stub once its own consent effect resolves,
    // which can lag this parent effect by a commit. Install the same queueing
    // stub here so the bounded event is never dropped while fbevents.js loads.
    const metaWindow = globalThis.window as { fbq?: Fbq; _fbq?: Fbq };
    ensureFbqStub(metaWindow)?.(
      'trackCustom',
      EDITORIAL_RETARGETING_EVENT,
      buildEditorialRetargetingEventFields(entry)
    );
  }, [state, entry]);

  if (state !== 'eligible' || !pixelId) return null;

  return <MetaPixel pixelIds={[pixelId]} />;
}
