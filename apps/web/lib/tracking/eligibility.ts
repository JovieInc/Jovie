/** The only third-party tracking policy. Adapters supply facts, never policy. */
export interface TrackingVisitor {
  readonly gpc?: boolean;
  readonly dnt?: boolean;
  /** JOV-10082: feed the visitor's sale/sharing opt-out here. */
  readonly optOut?: boolean;
  readonly under16?: boolean;
  readonly consentRequired?: boolean;
  readonly consent?: {
    readonly analytics: boolean;
    readonly marketing: boolean;
  } | null;
}

export interface TrackingProfile {
  readonly youngAudience: boolean;
}

export function trackingEligibility({
  profile,
  visitor,
}: {
  /** null = platform surface; undefined = unresolved artist (fail closed). */
  readonly profile: TrackingProfile | null | undefined;
  readonly visitor: TrackingVisitor;
}) {
  const blocked =
    profile === undefined ||
    (profile !== null && profile?.youngAudience !== false) ||
    visitor.gpc === true ||
    visitor.dnt === true ||
    visitor.optOut === true ||
    visitor.under16 === true;
  const marketing =
    !blocked && (visitor.consent?.marketing ?? !visitor.consentRequired);
  const analytics =
    !blocked && (visitor.consent?.analytics ?? !visitor.consentRequired);
  return {
    facebook: marketing,
    google: marketing,
    tiktok: marketing,
    ga: analytics,
    vercel: analytics,
  };
}

export type TrackingEligibility = ReturnType<typeof trackingEligibility>;
