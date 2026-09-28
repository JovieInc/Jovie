import type { RankedDecisionItem } from '@/lib/hud/decision-signals';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';

export interface OvieHomeBriefingAction {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
}

export interface OvieHomeBriefingSignal {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly currentValue: string;
  readonly delta: string | null;
  readonly target: string | null;
  readonly sourceLabel: string;
  readonly nextAction: string;
  readonly removalEvent: string;
  readonly summerCanAct: boolean;
}

export interface OvieHomeBriefing {
  readonly greeting: string;
  readonly updatedLabel: string;
  readonly signal: OvieHomeBriefingSignal;
  readonly actions: readonly OvieHomeBriefingAction[];
}

interface CreateOvieHomeBriefingOptions {
  readonly displayName?: string | null;
  readonly now?: Date;
  readonly timeZone: string;
}

function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || 'Tim';
}

function localHour(now: Date, timeZone: string): number {
  const value = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).format(now);
  const hour = Number.parseInt(value, 10);
  return Number.isFinite(hour) ? hour : 12;
}

function greetingFor(
  displayName: string | null | undefined,
  now: Date,
  timeZone: string
): string {
  const hour = localHour(now, timeZone);
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `Good ${period}, ${firstName(displayName)}.`;
}

function updatedLabel(now: Date, timeZone: string): string {
  return `Updated ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(now)}`;
}

function sourceLabel(source: string): string {
  const normalized = source.replace(/^canonical-metrics:/, '');
  if (normalized === 'github') return 'GitHub';
  return normalized
    .split(/[-_:]/)
    .filter(Boolean)
    .map(word => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ');
}

function signalFromDecision(item: RankedDecisionItem): OvieHomeBriefingSignal {
  const { candidate } = item;
  return {
    id: candidate.id,
    title: candidate.title,
    summary: candidate.whyNow,
    currentValue: candidate.currentValue,
    delta: candidate.delta,
    target: candidate.target,
    sourceLabel: sourceLabel(candidate.source),
    nextAction:
      candidate.nextAction ?? 'Review the signal and choose a next step.',
    removalEvent: candidate.removalEvent,
    summerCanAct: candidate.summerCanAct,
  };
}

function formatGrowth(rate: number): string {
  return `${(rate * 100).toLocaleString('en-US', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })}%`;
}

function fallbackSignal(
  snapshot: OvieMacHudSnapshot | null
): OvieHomeBriefingSignal {
  if (snapshot?.growth.available && snapshot.growth.rate >= 0.05) {
    const growth = formatGrowth(snapshot.growth.rate);
    return {
      id: 'growth.current-momentum',
      title: `Growth reached ${growth} this week`,
      summary:
        'This is the strongest current momentum signal. Find the cause while the evidence is fresh.',
      currentValue: `${growth} week over week from ${snapshot.growth.source}`,
      delta: null,
      target: 'Sustain at least 5% weekly growth',
      sourceLabel: 'Growth',
      nextAction: 'Identify what drove this week’s growth and repeat it.',
      removalEvent: 'Growth falls below 5% or a higher-value signal appears.',
      summerCanAct: true,
    };
  }

  if (snapshot?.shipping.available && snapshot.shipping.shipsThisWeek > 0) {
    const ships = snapshot.shipping.shipsThisWeek.toLocaleString('en-US');
    return {
      id: 'shipping.current-momentum',
      title: `${ships} ${snapshot.shipping.shipsThisWeek === 1 ? 'change' : 'changes'} shipped this week`,
      summary:
        'Shipping is the clearest current progress signal. Check which release moved the company bottleneck.',
      currentValue: snapshot.shipping.detail,
      delta: null,
      target: 'Ship against the current company bottleneck',
      sourceLabel: 'Shipping',
      nextAction:
        'Identify the shipped change with the highest customer value.',
      removalEvent: 'A higher-value growth, revenue, or risk signal appears.',
      summerCanAct: true,
    };
  }

  return {
    id: 'signals.coverage-incomplete',
    title: 'The operating picture is incomplete',
    summary:
      'Revenue, runway, and shipping are not all reporting yet. Signal coverage is the attention item.',
    currentValue: 'Ovie needs a current verified operating signal',
    delta: null,
    target: 'One fresh, actionable signal',
    sourceLabel: 'Ovie',
    nextAction: 'Restore the missing source and recompute the briefing.',
    removalEvent: 'A fresh actionable signal is available.',
    summerCanAct: true,
  };
}

function actionLabel(signal: OvieHomeBriefingSignal): string {
  return signal.summerCanAct ? 'Start The Next Step' : 'Frame The Decision';
}

function actionsFor(
  signal: OvieHomeBriefingSignal
): readonly OvieHomeBriefingAction[] {
  return [
    {
      id: `${signal.id}:next-step`,
      label: actionLabel(signal),
      prompt: `Help me act on “${signal.title}.” The recommended next step is: ${signal.nextAction}`,
    },
    {
      id: `${signal.id}:evidence`,
      label: 'Show The Evidence',
      prompt: `Show me the evidence behind “${signal.title},” including the current value, source, and what changed.`,
    },
    {
      id: `${signal.id}:clear-condition`,
      label: 'Review The Clear Condition',
      prompt: `For “${signal.title},” explain what clears or replaces it: ${signal.removalEvent}`,
    },
  ];
}

/**
 * Converts the canonical decision-value ranking into one scan-first home item.
 * Ranked attention beats healthy momentum; generic prompts stay a last resort.
 */
export function createOvieHomeBriefing(
  snapshot: OvieMacHudSnapshot | null,
  options: CreateOvieHomeBriefingOptions
): OvieHomeBriefing {
  const now = options.now ?? new Date();
  const ranked = snapshot?.decisionHud?.items[0];
  const signal = ranked ? signalFromDecision(ranked) : fallbackSignal(snapshot);

  return {
    greeting: greetingFor(options.displayName, now, options.timeZone),
    updatedLabel: updatedLabel(now, options.timeZone),
    signal,
    actions: actionsFor(signal),
  };
}
