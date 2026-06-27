export type WarRoomVendorAction = 'keep' | 'cut' | 'defer';

export type WarRoomDecisionStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'blocked';

export type WarRoomBridgeStatus =
  | 'not_started'
  | 'in_progress'
  | 'ready_for_outreach';

export type WarRoomDefaultStatus = 'alive' | 'dead' | 'unknown';

export type WarRoomAlertSeverity = 'info' | 'warning' | 'critical';

export interface WarRoomValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface WarRoomVendorEntry {
  readonly id: string;
  readonly label: string;
  readonly monthlyUsd: number;
  readonly renewalDate: string | null;
  readonly owner: string;
  readonly action: WarRoomVendorAction;
  readonly impact: string;
}

export interface WarRoomNextPayment {
  readonly id: string;
  readonly label: string;
  readonly amountUsd: number;
  readonly dueDate: string;
}

export interface WarRoomDailyDecision {
  readonly id: string;
  readonly label: string;
  readonly status: WarRoomDecisionStatus;
  readonly owner: string;
  readonly linearIssueId?: string;
  readonly requiresHumanApproval: boolean;
}

export interface WarRoomLedger {
  readonly schemaVersion: 1;
  readonly lastVerifiedAt: string | null;
  readonly lastVerifiedBy: string | null;
  readonly cashConstraintUsd: number;
  readonly cashTruth: {
    readonly balanceUsd: number;
    readonly verified: boolean;
    readonly source: string;
    readonly notes: string;
  };
  readonly burnFreeze: {
    readonly active: boolean;
    readonly effectiveAt: string;
    readonly notes: string;
  };
  readonly vendors: readonly WarRoomVendorEntry[];
  readonly nextPayments: readonly WarRoomNextPayment[];
  readonly bridgePipeline: {
    readonly targetCount: number;
    readonly identifiedCount: number;
    readonly status: WarRoomBridgeStatus;
    readonly notes: string;
  };
  readonly acceleratorFacts: {
    readonly program: string;
    readonly submissionStatus: string;
    readonly deadlineNote: string;
    readonly cashUsd: number;
    readonly runwayDays: number | null;
    readonly mrrUsd: number | null;
    readonly activeUsers: number | null;
    readonly lastReconciledAt: string | null;
  };
  readonly dailyDecisions: readonly WarRoomDailyDecision[];
}

export interface WarRoomLiveInputs {
  readonly balanceUsd?: number | null;
  readonly burnRateUsd?: number | null;
  readonly mrrUsd?: number | null;
  readonly activeSubscribers?: number | null;
  readonly mercuryAvailable?: boolean;
  readonly stripeAvailable?: boolean;
}

export interface WarRoomAlert {
  readonly id: string;
  readonly severity: WarRoomAlertSeverity;
  readonly message: string;
}

export interface WarRoomHudSnapshot {
  readonly schemaVersion: 1;
  readonly generatedAtIso: string;
  readonly ledgerPath: string;
  readonly isValid: boolean;
  readonly validationIssues: readonly WarRoomValidationIssue[];
  readonly cashConstraintUsd: number;
  readonly cashTruthBalanceUsd: number;
  readonly cashTruthVerified: boolean;
  readonly liveBalanceUsd: number | null;
  readonly burnRateUsd: number | null;
  readonly mrrUsd: number | null;
  readonly netBurnMonthlyUsd: number | null;
  readonly runwayDays: number | null;
  readonly runwayMonths: number | null;
  readonly defaultStatus: WarRoomDefaultStatus;
  readonly defaultStatusDetail: string;
  readonly burnFreezeActive: boolean;
  readonly vendorSummary: {
    readonly keep: number;
    readonly cut: number;
    readonly defer: number;
    readonly monthlyKeepUsd: number;
    readonly monthlyCutUsd: number;
    readonly monthlyDeferUsd: number;
  };
  readonly nextPaymentsDue14d: readonly WarRoomNextPayment[];
  readonly bridgePipeline: WarRoomLedger['bridgePipeline'];
  readonly acceleratorFacts: WarRoomLedger['acceleratorFacts'];
  readonly dailyDecisions: readonly WarRoomDailyDecision[];
  readonly alerts: readonly WarRoomAlert[];
  readonly operatingInvariantCompliant: boolean;
}

const REQUIRED_VENDOR_FIELDS: readonly (keyof WarRoomVendorEntry)[] = [
  'id',
  'label',
  'monthlyUsd',
  'owner',
  'action',
  'impact',
];

const REQUIRED_DECISION_FIELDS: readonly (keyof WarRoomDailyDecision)[] = [
  'id',
  'label',
  'status',
  'owner',
  'requiresHumanApproval',
];

const VENDOR_ACTIONS = new Set<WarRoomVendorAction>(['keep', 'cut', 'defer']);
const DECISION_STATUSES = new Set<WarRoomDecisionStatus>([
  'pending',
  'in_progress',
  'done',
  'blocked',
]);
const BRIDGE_STATUSES = new Set<WarRoomBridgeStatus>([
  'not_started',
  'in_progress',
  'ready_for_outreach',
]);

const RUNWAY_ALERT_DAYS = 14;
const CASH_MISMATCH_TOLERANCE_USD = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function readString(
  record: Record<string, unknown>,
  key: string,
  issues: WarRoomValidationIssue[],
  path: string,
  required = true
): string | null {
  const value = record[key];
  if (value == null) {
    if (required) {
      issues.push({
        path: `${path}.${key}`,
        message: 'Required string missing',
      });
    }
    return null;
  }
  if (!isNonEmptyString(value)) {
    issues.push({
      path: `${path}.${key}`,
      message: 'Expected non-empty string',
    });
    return null;
  }
  return value;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  issues: WarRoomValidationIssue[],
  path: string,
  options: { required?: boolean; min?: number } = {}
): number | null {
  const value = record[key];
  if (value == null) {
    if (options.required !== false) {
      issues.push({
        path: `${path}.${key}`,
        message: 'Required number missing',
      });
    }
    return null;
  }
  if (!isFiniteNumber(value)) {
    issues.push({ path: `${path}.${key}`, message: 'Expected finite number' });
    return null;
  }
  if (options.min != null && value < options.min) {
    issues.push({
      path: `${path}.${key}`,
      message: `Expected number >= ${options.min}`,
    });
    return null;
  }
  return value;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  issues: WarRoomValidationIssue[],
  path: string
): boolean | null {
  const value = record[key];
  if (typeof value !== 'boolean') {
    issues.push({ path: `${path}.${key}`, message: 'Expected boolean' });
    return null;
  }
  return value;
}

function parseVendor(
  value: unknown,
  index: number,
  issues: WarRoomValidationIssue[]
): WarRoomVendorEntry | null {
  const path = `vendors[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path, message: 'Expected vendor object' });
    return null;
  }

  for (const field of REQUIRED_VENDOR_FIELDS) {
    if (value[field] == null) {
      issues.push({
        path: `${path}.${field}`,
        message: 'Required field missing',
      });
      return null;
    }
  }

  const action = value.action;
  if (
    typeof action !== 'string' ||
    !VENDOR_ACTIONS.has(action as WarRoomVendorAction)
  ) {
    issues.push({ path: `${path}.action`, message: 'Invalid vendor action' });
    return null;
  }

  const monthlyUsd = readNumber(value, 'monthlyUsd', issues, path, { min: 0 });
  const id = readString(value, 'id', issues, path);
  const label = readString(value, 'label', issues, path);
  const owner = readString(value, 'owner', issues, path);
  const impact = readString(value, 'impact', issues, path);
  if (
    id == null ||
    label == null ||
    owner == null ||
    impact == null ||
    monthlyUsd == null
  ) {
    return null;
  }

  const renewalRaw = value.renewalDate;
  let renewalDate: string | null = null;
  if (renewalRaw != null) {
    if (!isNonEmptyString(renewalRaw) || !isIsoDate(renewalRaw)) {
      issues.push({
        path: `${path}.renewalDate`,
        message: 'Expected ISO date string or null',
      });
      return null;
    }
    renewalDate = renewalRaw;
  }

  return {
    id,
    label,
    monthlyUsd,
    renewalDate,
    owner,
    action: action as WarRoomVendorAction,
    impact,
  };
}

function parseNextPayment(
  value: unknown,
  index: number,
  issues: WarRoomValidationIssue[]
): WarRoomNextPayment | null {
  const path = `nextPayments[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path, message: 'Expected payment object' });
    return null;
  }

  const id = readString(value, 'id', issues, path);
  const label = readString(value, 'label', issues, path);
  const amountUsd = readNumber(value, 'amountUsd', issues, path, { min: 0 });
  const dueDate = readString(value, 'dueDate', issues, path);
  if (id == null || label == null || amountUsd == null || dueDate == null) {
    return null;
  }
  if (!isIsoDate(dueDate)) {
    issues.push({
      path: `${path}.dueDate`,
      message: 'Expected ISO date string',
    });
    return null;
  }

  return { id, label, amountUsd, dueDate };
}

function parseDailyDecision(
  value: unknown,
  index: number,
  issues: WarRoomValidationIssue[]
): WarRoomDailyDecision | null {
  const path = `dailyDecisions[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path, message: 'Expected decision object' });
    return null;
  }

  for (const field of REQUIRED_DECISION_FIELDS) {
    if (value[field] == null && field !== 'requiresHumanApproval') {
      issues.push({
        path: `${path}.${field}`,
        message: 'Required field missing',
      });
      return null;
    }
  }

  const status = value.status;
  if (
    typeof status !== 'string' ||
    !DECISION_STATUSES.has(status as WarRoomDecisionStatus)
  ) {
    issues.push({ path: `${path}.status`, message: 'Invalid decision status' });
    return null;
  }

  const requiresHumanApproval = readBoolean(
    value,
    'requiresHumanApproval',
    issues,
    path
  );
  const id = readString(value, 'id', issues, path);
  const label = readString(value, 'label', issues, path);
  const owner = readString(value, 'owner', issues, path);
  if (
    id == null ||
    label == null ||
    owner == null ||
    requiresHumanApproval == null
  ) {
    return null;
  }

  const linearIssueId = readString(value, 'linearIssueId', issues, path, false);

  return {
    id,
    label,
    status: status as WarRoomDecisionStatus,
    owner,
    linearIssueId: linearIssueId ?? undefined,
    requiresHumanApproval,
  };
}

export function parseWarRoomLedger(raw: unknown): {
  ledger: WarRoomLedger | null;
  issues: WarRoomValidationIssue[];
} {
  const issues: WarRoomValidationIssue[] = [];
  if (!isRecord(raw)) {
    return {
      ledger: null,
      issues: [{ path: 'root', message: 'Expected war room ledger object' }],
    };
  }

  if (raw.schemaVersion !== 1) {
    issues.push({ path: 'schemaVersion', message: 'Expected schemaVersion 1' });
  }

  const cashConstraintUsd = readNumber(
    raw,
    'cashConstraintUsd',
    issues,
    'root',
    {
      min: 0,
    }
  );
  if (!isRecord(raw.cashTruth)) {
    issues.push({ path: 'cashTruth', message: 'Expected cashTruth object' });
    return { ledger: null, issues };
  }
  if (!isRecord(raw.burnFreeze)) {
    issues.push({ path: 'burnFreeze', message: 'Expected burnFreeze object' });
    return { ledger: null, issues };
  }
  if (!isRecord(raw.bridgePipeline)) {
    issues.push({
      path: 'bridgePipeline',
      message: 'Expected bridgePipeline object',
    });
    return { ledger: null, issues };
  }
  if (!isRecord(raw.acceleratorFacts)) {
    issues.push({
      path: 'acceleratorFacts',
      message: 'Expected acceleratorFacts object',
    });
    return { ledger: null, issues };
  }

  const cashBalanceUsd = readNumber(
    raw.cashTruth,
    'balanceUsd',
    issues,
    'cashTruth',
    { min: 0 }
  );
  const cashVerified = readBoolean(
    raw.cashTruth,
    'verified',
    issues,
    'cashTruth'
  );
  const cashSource = readString(raw.cashTruth, 'source', issues, 'cashTruth');
  const cashNotes = readString(raw.cashTruth, 'notes', issues, 'cashTruth');

  const burnFreezeActive = readBoolean(
    raw.burnFreeze,
    'active',
    issues,
    'burnFreeze'
  );
  const burnFreezeEffectiveAt = readString(
    raw.burnFreeze,
    'effectiveAt',
    issues,
    'burnFreeze'
  );
  const burnFreezeNotes = readString(
    raw.burnFreeze,
    'notes',
    issues,
    'burnFreeze'
  );

  const vendors = Array.isArray(raw.vendors)
    ? raw.vendors
        .map((entry, index) => parseVendor(entry, index, issues))
        .filter((entry): entry is WarRoomVendorEntry => entry != null)
    : [];
  if (!Array.isArray(raw.vendors)) {
    issues.push({ path: 'vendors', message: 'Expected vendors array' });
  }

  const nextPayments = Array.isArray(raw.nextPayments)
    ? raw.nextPayments
        .map((entry, index) => parseNextPayment(entry, index, issues))
        .filter((entry): entry is WarRoomNextPayment => entry != null)
    : [];
  if (!Array.isArray(raw.nextPayments)) {
    issues.push({
      path: 'nextPayments',
      message: 'Expected nextPayments array',
    });
  }

  const dailyDecisions = Array.isArray(raw.dailyDecisions)
    ? raw.dailyDecisions
        .map((entry, index) => parseDailyDecision(entry, index, issues))
        .filter((entry): entry is WarRoomDailyDecision => entry != null)
    : [];
  if (!Array.isArray(raw.dailyDecisions)) {
    issues.push({
      path: 'dailyDecisions',
      message: 'Expected dailyDecisions array',
    });
  }

  const bridgeTargetCount = readNumber(
    raw.bridgePipeline,
    'targetCount',
    issues,
    'bridgePipeline',
    { min: 0 }
  );
  const bridgeIdentifiedCount = readNumber(
    raw.bridgePipeline,
    'identifiedCount',
    issues,
    'bridgePipeline',
    { min: 0 }
  );
  const bridgeStatusRaw = raw.bridgePipeline.status;
  if (
    typeof bridgeStatusRaw !== 'string' ||
    !BRIDGE_STATUSES.has(bridgeStatusRaw as WarRoomBridgeStatus)
  ) {
    issues.push({
      path: 'bridgePipeline.status',
      message: 'Invalid bridge pipeline status',
    });
  }
  const bridgeNotes = readString(
    raw.bridgePipeline,
    'notes',
    issues,
    'bridgePipeline'
  );

  const program = readString(
    raw.acceleratorFacts,
    'program',
    issues,
    'acceleratorFacts'
  );
  const submissionStatus = readString(
    raw.acceleratorFacts,
    'submissionStatus',
    issues,
    'acceleratorFacts'
  );
  const deadlineNote = readString(
    raw.acceleratorFacts,
    'deadlineNote',
    issues,
    'acceleratorFacts'
  );
  const acceleratorCashUsd = readNumber(
    raw.acceleratorFacts,
    'cashUsd',
    issues,
    'acceleratorFacts',
    { min: 0 }
  );

  const lastVerifiedAtRaw = raw.lastVerifiedAt;
  const lastVerifiedAt =
    lastVerifiedAtRaw == null
      ? null
      : isNonEmptyString(lastVerifiedAtRaw) && isIsoDate(lastVerifiedAtRaw)
        ? lastVerifiedAtRaw
        : (issues.push({
            path: 'lastVerifiedAt',
            message: 'Expected ISO date string or null',
          }),
          null);

  const lastVerifiedByRaw = raw.lastVerifiedBy;
  const lastVerifiedBy =
    lastVerifiedByRaw == null
      ? null
      : isNonEmptyString(lastVerifiedByRaw)
        ? lastVerifiedByRaw
        : (issues.push({
            path: 'lastVerifiedBy',
            message: 'Expected string or null',
          }),
          null);

  if (
    cashConstraintUsd == null ||
    cashBalanceUsd == null ||
    cashVerified == null ||
    cashSource == null ||
    cashNotes == null ||
    burnFreezeActive == null ||
    burnFreezeEffectiveAt == null ||
    burnFreezeNotes == null ||
    bridgeTargetCount == null ||
    bridgeIdentifiedCount == null ||
    bridgeNotes == null ||
    program == null ||
    submissionStatus == null ||
    deadlineNote == null ||
    acceleratorCashUsd == null
  ) {
    return { ledger: null, issues };
  }

  const acceleratorRunwayDays = readNumber(
    raw.acceleratorFacts,
    'runwayDays',
    issues,
    'acceleratorFacts',
    { required: false, min: 0 }
  );
  const acceleratorMrrUsd = readNumber(
    raw.acceleratorFacts,
    'mrrUsd',
    issues,
    'acceleratorFacts',
    { required: false, min: 0 }
  );
  const acceleratorActiveUsers = readNumber(
    raw.acceleratorFacts,
    'activeUsers',
    issues,
    'acceleratorFacts',
    { required: false, min: 0 }
  );
  const acceleratorLastReconciledAt = readString(
    raw.acceleratorFacts,
    'lastReconciledAt',
    issues,
    'acceleratorFacts',
    false
  );

  if (issues.length > 0) {
    return { ledger: null, issues };
  }

  return {
    ledger: {
      schemaVersion: 1,
      lastVerifiedAt,
      lastVerifiedBy,
      cashConstraintUsd,
      cashTruth: {
        balanceUsd: cashBalanceUsd,
        verified: cashVerified,
        source: cashSource,
        notes: cashNotes,
      },
      burnFreeze: {
        active: burnFreezeActive,
        effectiveAt: burnFreezeEffectiveAt,
        notes: burnFreezeNotes,
      },
      vendors,
      nextPayments,
      bridgePipeline: {
        targetCount: bridgeTargetCount,
        identifiedCount: bridgeIdentifiedCount,
        status: bridgeStatusRaw as WarRoomBridgeStatus,
        notes: bridgeNotes,
      },
      acceleratorFacts: {
        program,
        submissionStatus,
        deadlineNote,
        cashUsd: acceleratorCashUsd,
        runwayDays: acceleratorRunwayDays,
        mrrUsd: acceleratorMrrUsd,
        activeUsers: acceleratorActiveUsers,
        lastReconciledAt: acceleratorLastReconciledAt,
      },
      dailyDecisions,
    },
    issues,
  };
}

function summarizeVendors(vendors: readonly WarRoomVendorEntry[]) {
  return vendors.reduce(
    (summary, vendor) => {
      summary[vendor.action] += 1;
      if (vendor.action === 'keep') summary.monthlyKeepUsd += vendor.monthlyUsd;
      if (vendor.action === 'cut') summary.monthlyCutUsd += vendor.monthlyUsd;
      if (vendor.action === 'defer')
        summary.monthlyDeferUsd += vendor.monthlyUsd;
      return summary;
    },
    {
      keep: 0,
      cut: 0,
      defer: 0,
      monthlyKeepUsd: 0,
      monthlyCutUsd: 0,
      monthlyDeferUsd: 0,
    }
  );
}

function computeDefaultStatus(
  netBurnMonthlyUsd: number | null,
  runwayDays: number | null,
  mrrUsd: number | null,
  burnRateUsd: number | null
): { status: WarRoomDefaultStatus; detail: string } {
  if (netBurnMonthlyUsd == null || burnRateUsd == null) {
    return {
      status: 'unknown',
      detail: 'Runway cannot be computed until burn and cash sources agree.',
    };
  }

  if (netBurnMonthlyUsd <= 0) {
    return {
      status: 'alive',
      detail: 'Revenue already exceeds spend at the current run rate.',
    };
  }

  if (runwayDays == null) {
    return {
      status: 'alive',
      detail: 'Runway is unlimited at the current cash-flow rate.',
    };
  }

  const revenueGrowth30d = mrrUsd != null && mrrUsd > 0 ? mrrUsd * 0.05 : 0;
  const monthsToProfitability =
    revenueGrowth30d > 0 ? netBurnMonthlyUsd / revenueGrowth30d : null;
  const runwayMonths = runwayDays / 30;

  if (monthsToProfitability != null && monthsToProfitability <= runwayMonths) {
    return {
      status: 'alive',
      detail: `Runway covers roughly ${monthsToProfitability.toFixed(1)} months to profitability.`,
    };
  }

  return {
    status: 'dead',
    detail: 'At the current growth rate, runway ends before profitability.',
  };
}

function paymentsDueWithinDays(
  payments: readonly WarRoomNextPayment[],
  days: number,
  now = new Date()
): WarRoomNextPayment[] {
  const horizonMs = days * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  return payments.filter(payment => {
    const dueMs = Date.parse(payment.dueDate);
    return dueMs <= nowMs + horizonMs;
  });
}

function buildAlerts(options: {
  ledger: WarRoomLedger;
  liveBalanceUsd: number | null;
  runwayDays: number | null;
  mercuryAvailable: boolean;
  stripeAvailable: boolean;
  now?: Date;
}): WarRoomAlert[] {
  const alerts: WarRoomAlert[] = [];
  const {
    ledger,
    liveBalanceUsd,
    runwayDays,
    mercuryAvailable,
    stripeAvailable,
  } = options;

  if (!ledger.cashTruth.verified) {
    alerts.push({
      id: 'cash-unverified',
      severity: 'warning',
      message: `Cash truth is manual at ${ledger.cashTruth.balanceUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} until CFO verification (JOV-1859).`,
    });
  }

  if (
    mercuryAvailable &&
    liveBalanceUsd != null &&
    Math.abs(liveBalanceUsd - ledger.cashTruth.balanceUsd) >
      CASH_MISMATCH_TOLERANCE_USD
  ) {
    alerts.push({
      id: 'cash-mismatch',
      severity: 'critical',
      message: `Ledger cash (${ledger.cashTruth.balanceUsd}) disagrees with Mercury balance (${liveBalanceUsd}).`,
    });
  }

  if (
    Math.abs(ledger.acceleratorFacts.cashUsd - ledger.cashTruth.balanceUsd) >
    CASH_MISMATCH_TOLERANCE_USD
  ) {
    alerts.push({
      id: 'accelerator-cash-mismatch',
      severity: 'critical',
      message: 'Accelerator facts cash does not match war-room cash truth.',
    });
  }

  if (runwayDays != null && runwayDays < RUNWAY_ALERT_DAYS) {
    alerts.push({
      id: 'runway-critical',
      severity: 'critical',
      message: `Runway is below ${RUNWAY_ALERT_DAYS} days (${runwayDays.toFixed(1)} days remaining).`,
    });
  } else if (runwayDays != null && runwayDays < RUNWAY_ALERT_DAYS * 2) {
    alerts.push({
      id: 'runway-warning',
      severity: 'warning',
      message: `Runway is under ${RUNWAY_ALERT_DAYS * 2} days (${runwayDays.toFixed(1)} days remaining).`,
    });
  }

  if (!ledger.burnFreeze.active) {
    alerts.push({
      id: 'burn-freeze-off',
      severity: 'warning',
      message:
        'Burn freeze is not active — nonessential spend may still be running.',
    });
  }

  if (!mercuryAvailable) {
    alerts.push({
      id: 'mercury-unavailable',
      severity: 'info',
      message:
        'Mercury is unavailable; war room is using ledger cash truth only.',
    });
  }

  if (!stripeAvailable) {
    alerts.push({
      id: 'stripe-unavailable',
      severity: 'info',
      message: 'Stripe is unavailable; MRR is omitted from default-alive math.',
    });
  }

  const dueSoon = paymentsDueWithinDays(
    ledger.nextPayments,
    RUNWAY_ALERT_DAYS,
    options.now
  );
  if (dueSoon.length > 0) {
    const totalDue = dueSoon.reduce(
      (sum, payment) => sum + payment.amountUsd,
      0
    );
    alerts.push({
      id: 'payments-due-14d',
      severity: 'warning',
      message: `${dueSoon.length} payment(s) due within ${RUNWAY_ALERT_DAYS} days (${totalDue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}).`,
    });
  }

  const openDecisions = ledger.dailyDecisions.filter(
    decision => decision.status !== 'done'
  );
  if (openDecisions.length > 0) {
    alerts.push({
      id: 'open-decisions',
      severity: 'info',
      message: `${openDecisions.length} daily decision(s) still open in the war room loop.`,
    });
  }

  return alerts;
}

export function buildWarRoomHudSnapshot(options: {
  ledger: WarRoomLedger;
  ledgerPath: string;
  live?: WarRoomLiveInputs;
  generatedAt?: Date;
  validationIssues?: readonly WarRoomValidationIssue[];
}): WarRoomHudSnapshot {
  const generatedAt = options.generatedAt ?? new Date();
  const live = options.live ?? {};
  const validationIssues = options.validationIssues ?? [];

  const ledgerBalanceUsd = options.ledger.cashTruth.balanceUsd;
  const liveBalanceUsd =
    live.mercuryAvailable && live.balanceUsd != null ? live.balanceUsd : null;
  const effectiveBalanceUsd = liveBalanceUsd ?? ledgerBalanceUsd;
  const burnRateUsd =
    live.mercuryAvailable && live.burnRateUsd != null ? live.burnRateUsd : null;
  const mrrUsd =
    live.stripeAvailable && live.mrrUsd != null ? live.mrrUsd : null;

  const netBurnMonthlyUsd =
    burnRateUsd != null && mrrUsd != null ? burnRateUsd - mrrUsd : null;

  const runwayDays =
    netBurnMonthlyUsd != null && netBurnMonthlyUsd > 0
      ? (effectiveBalanceUsd / netBurnMonthlyUsd) * 30
      : null;

  const runwayMonths = runwayDays != null ? runwayDays / 30 : null;
  const defaultStatus = computeDefaultStatus(
    netBurnMonthlyUsd,
    runwayDays,
    mrrUsd,
    burnRateUsd
  );

  const alerts = buildAlerts({
    ledger: options.ledger,
    liveBalanceUsd,
    runwayDays,
    mercuryAvailable: live.mercuryAvailable === true,
    stripeAvailable: live.stripeAvailable === true,
    now: generatedAt,
  });

  const acceleratorCashMatchesTruth =
    Math.abs(
      options.ledger.acceleratorFacts.cashUsd -
        options.ledger.cashTruth.balanceUsd
    ) <= CASH_MISMATCH_TOLERANCE_USD;

  const operatingInvariantCompliant =
    alerts.every(alert => alert.severity !== 'critical') &&
    options.ledger.burnFreeze.active &&
    acceleratorCashMatchesTruth;

  return {
    schemaVersion: 1,
    generatedAtIso: generatedAt.toISOString(),
    ledgerPath: options.ledgerPath,
    isValid: validationIssues.length === 0,
    validationIssues,
    cashConstraintUsd: options.ledger.cashConstraintUsd,
    cashTruthBalanceUsd: ledgerBalanceUsd,
    cashTruthVerified: options.ledger.cashTruth.verified,
    liveBalanceUsd,
    burnRateUsd,
    mrrUsd,
    netBurnMonthlyUsd,
    runwayDays,
    runwayMonths,
    defaultStatus: defaultStatus.status,
    defaultStatusDetail: defaultStatus.detail,
    burnFreezeActive: options.ledger.burnFreeze.active,
    vendorSummary: summarizeVendors(options.ledger.vendors),
    nextPaymentsDue14d: paymentsDueWithinDays(
      options.ledger.nextPayments,
      RUNWAY_ALERT_DAYS,
      generatedAt
    ),
    bridgePipeline: options.ledger.bridgePipeline,
    acceleratorFacts: options.ledger.acceleratorFacts,
    dailyDecisions: options.ledger.dailyDecisions,
    alerts,
    operatingInvariantCompliant,
  };
}
