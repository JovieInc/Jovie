'use client';

import { Check, MousePointer2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { ChatMarkdown } from '@/components/jovie/components/ChatMarkdown';
import { AgentPulse } from '@/components/shell/AgentPulse';
import { ArtworkThumb } from '@/components/shell/ArtworkThumb';
import { ThreadTurn } from '@/components/shell/ThreadTurn';
import { ThreadView } from '@/components/shell/ThreadView';
import { DemoClientProviders } from '@/features/demo/DemoClientProviders';
import { DemoReleasesExperience } from '@/features/demo/DemoReleasesExperience';
import { DemoTimWhiteProfileSurface } from '@/features/demo/DemoTimWhiteProfileSurface';
import { FOUNDER_DEMO_DASHBOARD_DATA } from '@/features/demo/mock-dashboard-data';
import {
  FOUNDER_DEMO_DURATION_SECONDS,
  type FounderDemoSceneId,
  getFounderDemoSceneAt,
} from '@/lib/demo-founder-video';
import { cn } from '@/lib/utils';

const USER_PROMPT = 'Show me the EDC opportunity.';

const OPPORTUNITY_RESPONSE = `Cosmic Gate is playing EDC Las Vegas this weekend.

You have a relevant song with them: **The Deep End**.

Jovie connects that to your trance fan segment, recent Jovie Link activity, and the June Prime Day commerce window.`;

const CAMPAIGN_RESPONSE = `Recommended move: run a 72-hour **The Deep End Weekend Drop**.

Best option: **The Deep End Festival Tee**.

Revenue path: **263 orders x $38 = $9,994**.`;

const MONITORING_RESPONSE = `I updated the Jovie Link, drafted the fan notification, created content tasks, scheduled the drop, and turned monitoring on.

I'll watch clicks, purchases, replies, and fan activity after launch, then recommend the next move.`;

const CURSOR_PATH = [
  { at: 0, x: 1015, y: 118 },
  { at: 7, x: 1015, y: 118 },
  { at: 9, x: 1045, y: 666 },
  { at: 16, x: 1210, y: 666 },
  { at: 30, x: 860, y: 450 },
  { at: 43, x: 1135, y: 594 },
  { at: 50, x: 454, y: 315 },
  { at: 63, x: 430, y: 240 },
  { at: 76, x: 930, y: 370 },
  { at: 93, x: 1015, y: 118 },
] as const;

const CLICK_TIMES = [9, 16, 43, 50, 63] as const;

function useDemoElapsedSeconds() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    let frameId = 0;

    const tick = () => {
      const elapsed = Math.min(
        FOUNDER_DEMO_DURATION_SECONDS,
        (performance.now() - startedAt) / 1000
      );
      setElapsedSeconds(elapsed);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return elapsedSeconds;
}

function typedText(
  value: string,
  elapsedSeconds: number,
  startsAt: number,
  endsAt: number
) {
  if (elapsedSeconds < startsAt) {
    return '';
  }

  const progress = Math.min(
    1,
    (elapsedSeconds - startsAt) / (endsAt - startsAt)
  );
  return value.slice(0, Math.floor(value.length * progress));
}

function typedMarkdown(
  value: string,
  elapsedSeconds: number,
  startsAt: number,
  endsAt: number
) {
  const typed = typedText(value, elapsedSeconds, startsAt, endsAt);
  if (!typed) {
    return '';
  }

  return typed.replace(/\*$/g, '');
}

function cursorPosition(elapsedSeconds: number) {
  const nextIndex = CURSOR_PATH.findIndex(point => point.at > elapsedSeconds);
  if (nextIndex <= 0) {
    return CURSOR_PATH[0]!;
  }

  const previous = CURSOR_PATH[nextIndex - 1]!;
  const next = CURSOR_PATH[nextIndex]!;
  const progress = Math.min(
    1,
    Math.max(0, (elapsedSeconds - previous.at) / (next.at - previous.at))
  );
  const eased = progress * progress * (3 - 2 * progress);

  return {
    x: previous.x + (next.x - previous.x) * eased,
    y: previous.y + (next.y - previous.y) * eased,
  };
}

function ProductCursor({
  elapsedSeconds,
}: {
  readonly elapsedSeconds: number;
}) {
  const position = cursorPosition(elapsedSeconds);
  const isClicking = CLICK_TIMES.some(
    time => Math.abs(elapsedSeconds - time) < 0.32
  );

  return (
    <div
      className='pointer-events-none absolute left-0 top-0 z-50 transition-transform duration-subtle'
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      {isClicking ? (
        <span className='absolute -left-3 -top-3 size-8 animate-ping rounded-full border border-primary-token/80' />
      ) : null}
      <MousePointer2 className='size-7 fill-white text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.75)]' />
    </div>
  );
}

function SignalCard({
  activeScene,
}: {
  readonly activeScene: FounderDemoSceneId;
}) {
  if (activeScene === 'fan-facing-layer') {
    return null;
  }

  return (
    <div className='pointer-events-none absolute left-[300px] top-[88px] z-20 w-[410px] rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur'>
      <div className='mb-2 flex items-center gap-3'>
        <ArtworkThumb
          src='/img/releases/the-deep-end.jpg'
          title='The Deep End'
          size={44}
          className='rounded-md'
        />
        <div className='min-w-0'>
          <div className='text-[13px] font-semibold text-primary-token'>
            Jovie found an opportunity
          </div>
          <div className='truncate text-[12px] text-tertiary-token'>
            The Deep End - Tim White x Cosmic Gate
          </div>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 text-[12px]'>
        <div className='rounded-md bg-surface-1 p-2'>
          <div className='text-tertiary-token'>External signal</div>
          <div className='mt-1 text-secondary-token'>EDC this weekend</div>
        </div>
        <div className='rounded-md bg-surface-1 p-2'>
          <div className='text-tertiary-token'>Audience signal</div>
          <div className='mt-1 text-secondary-token'>Recent link activity</div>
        </div>
      </div>
    </div>
  );
}

function ApprovalStatus({
  activeScene,
}: {
  readonly activeScene: FounderDemoSceneId;
}) {
  if (
    activeScene !== 'approval-execution' &&
    activeScene !== 'monitoring-loop'
  ) {
    return null;
  }

  return (
    <div className='pointer-events-none absolute left-[300px] bottom-[36px] z-20 flex items-center gap-2 rounded-full border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 px-3 py-2 text-[12px] text-secondary-token shadow-[0_12px_35px_rgba(0,0,0,0.32)]'>
      <span className='relative grid size-5 place-items-center rounded-full bg-primary-token text-(--linear-app-content-surface)'>
        <Check className='size-3' />
        {activeScene === 'approval-execution' ? (
          <AgentPulse className='rounded-full' />
        ) : null}
      </span>
      <span>
        {activeScene === 'approval-execution'
          ? 'Jovie is creating the weekend drop'
          : 'Weekend drop scheduled and monitoring is on'}
      </span>
    </div>
  );
}

function RecordingChatPanel({
  elapsedSeconds,
}: {
  readonly elapsedSeconds: number;
}) {
  const inputValue =
    elapsedSeconds < 16 ? typedText(USER_PROMPT, elapsedSeconds, 9, 15.5) : '';
  const promptSent = elapsedSeconds >= 16;
  const opportunityResponse = typedMarkdown(
    OPPORTUNITY_RESPONSE,
    elapsedSeconds,
    17,
    32
  );
  const campaignResponse = typedMarkdown(
    CAMPAIGN_RESPONSE,
    elapsedSeconds,
    34,
    46
  );
  const monitoringResponse = typedMarkdown(
    MONITORING_RESPONSE,
    elapsedSeconds,
    77,
    90
  );

  const isTyping =
    (elapsedSeconds >= 16.4 && elapsedSeconds < 17) ||
    (elapsedSeconds >= 33 && elapsedSeconds < 34) ||
    (elapsedSeconds >= 76 && elapsedSeconds < 77);

  return (
    <div className='absolute bottom-4 right-4 top-12 z-30 w-[430px] overflow-hidden rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/98 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur'>
      <ThreadView
        thread={{
          id: 'the-deep-end-weekend-drop',
          title: 'The Deep End Weekend Drop',
          status:
            elapsedSeconds >= 76 || elapsedSeconds < 16
              ? 'complete'
              : 'running',
          entityKind: 'release',
          entityId: 'The Deep End',
        }}
        composer={
          <ChatInput
            value={inputValue}
            onChange={() => undefined}
            onSubmit={() => undefined}
            isLoading={false}
            isSubmitting={false}
            placeholder='Ask Jovie'
            variant='compact'
            shellChatV1
          />
        }
      >
        <ThreadTurn speaker='jovie'>I found an opportunity.</ThreadTurn>
        {promptSent ? (
          <ThreadTurn speaker='me'>{USER_PROMPT}</ThreadTurn>
        ) : null}
        {isTyping ? (
          <ThreadTurn speaker='jovie' subtle>
            Jovie is typing...
          </ThreadTurn>
        ) : null}
        {opportunityResponse ? (
          <ThreadTurn speaker='jovie'>
            <ChatMarkdown content={opportunityResponse} />
          </ThreadTurn>
        ) : null}
        {campaignResponse ? (
          <ThreadTurn speaker='jovie'>
            <ChatMarkdown content={campaignResponse} />
          </ThreadTurn>
        ) : null}
        {elapsedSeconds >= 46 && elapsedSeconds < 76 ? (
          <div className='rounded-lg border border-(--linear-app-shell-border) bg-surface-1 p-3 text-[13px]'>
            <div className='mb-3 text-secondary-token'>
              Approve this and I will create the campaign, update your Jovie
              Link, draft the fan notification, schedule the drop, and monitor
              performance.
            </div>
            <button
              className='h-8 w-full rounded-md bg-primary-token text-[12.5px] font-medium text-(--linear-app-content-surface)'
              type='button'
            >
              Approve drop
            </button>
          </div>
        ) : null}
        {monitoringResponse ? (
          <ThreadTurn speaker='jovie'>
            <ChatMarkdown content={monitoringResponse} />
          </ThreadTurn>
        ) : null}
      </ThreadView>
    </div>
  );
}

export function FounderDemoRecordingSurface() {
  const elapsedSeconds = useDemoElapsedSeconds();
  const activeScene = useMemo(
    () => getFounderDemoSceneAt(elapsedSeconds).id,
    [elapsedSeconds]
  );
  const showFanSurface = activeScene === 'fan-facing-layer';
  const progress = Math.min(
    100,
    (elapsedSeconds / FOUNDER_DEMO_DURATION_SECONDS) * 100
  );

  return (
    <DemoClientProviders>
      <main
        className='relative h-screen w-screen overflow-hidden bg-(--linear-app-content-surface)'
        data-testid='founder-demo-recording-surface'
      >
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-cinematic',
            showFanSurface ? 'opacity-0' : 'opacity-100'
          )}
        >
          <DemoReleasesExperience
            dashboardData={FOUNDER_DEMO_DASHBOARD_DATA}
            variant='founder'
          />
        </div>
        <div
          className={cn(
            'absolute inset-0 overflow-hidden transition-opacity duration-cinematic',
            showFanSurface ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <DemoTimWhiteProfileSurface />
        </div>
        <SignalCard activeScene={activeScene} />
        <ApprovalStatus activeScene={activeScene} />
        <RecordingChatPanel elapsedSeconds={elapsedSeconds} />
        <ProductCursor elapsedSeconds={elapsedSeconds} />
        <div className='absolute bottom-0 left-0 right-0 z-40 h-1 bg-black/20'>
          <div
            className='h-full bg-primary-token transition-[width] duration-subtle'
            style={{ width: `${progress}%` }}
          />
        </div>
      </main>
    </DemoClientProviders>
  );
}
