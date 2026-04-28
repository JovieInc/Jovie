'use client';

// ---------------------------------------------------------------------------
// Onboarding C — chat-first interview that fades the app in by stages.
//
// Phase 0: empty stage. Just a chat with Jovie.
// Phase 1: handle claimed → tiny profile preview slides into the right rail.
// Phase 2: Spotify connected → right rail fills with catalog.
// Phase 3: plan picked → bottom audio bar fades in with their first track.
// Phase 4: ready → sidebar slides in, full app revealed (or, if Jovie
//          decides they're not ready, route to waitlist with transcript
//          saved for admin review).
// ---------------------------------------------------------------------------

import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  Mic,
  SendHorizonal,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

const PALETTE = {
  page: '#06070a',
  surface0: '#0a0b0e',
  surface1: '#101216',
  surface2: '#161a20',
  contentSurface: '#0a0c0f',
  border: '#171a20',
};

function JovieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 353.68 347.97'
      className={className}
      fill='currentColor'
      aria-hidden='true'
    >
      <title>Jovie</title>
      <path d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z' />
    </svg>
  );
}

// Conversation script — branches on user answers, can route to waitlist.
type Step =
  | 'welcome'
  | 'handle'
  | 'stage'
  | 'working'
  | 'stuck'
  | 'connect_spotify'
  | 'spotify_loading'
  | 'pick_track'
  | 'goal'
  | 'plan_recommend'
  | 'building'
  | 'ready'
  | 'waitlist_intro'
  | 'waitlist_done';

type Msg =
  | { id: string; role: 'jovie'; text: string }
  | { id: string; role: 'user'; text: string };

type Stage = {
  handleSet: boolean;
  spotifyConnected: boolean;
  planPicked: boolean;
  ready: boolean;
};

const TRACK_PICKS = [
  'Lost in the Light',
  'Stronger Than That',
  'All the Time',
  'Sunshine on My Back',
];

export default function OnboardingC() {
  const [step, setStep] = useState<Step>('welcome');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [handle, setHandle] = useState('');
  const [career, setCareer] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({
    handleSet: false,
    spotifyConnected: false,
    planPicked: false,
    ready: false,
  });
  const [textInput, setTextInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, typing]);

  async function sendJovie(lines: string[]) {
    for (const line of lines) {
      setTyping(true);
      await sleep(400 + line.length * 8);
      setTyping(false);
      setMessages(m => [
        ...m,
        { id: `j-${Date.now()}-${Math.random()}`, role: 'jovie', text: line },
      ]);
      await sleep(180);
    }
  }
  function sendUser(text: string) {
    setMessages(m => [
      ...m,
      { id: `u-${Date.now()}-${Math.random()}`, role: 'user', text },
    ]);
  }

  // Initial Jovie greeting.
  useEffect(() => {
    sendJovie([
      "Hey. I'm Jovie — I'll help you set up your home and figure out the best way I can help you this quarter.",
      "Let's start simple. What handle do you want? It'll be jov.ie/yourname.",
    ]).then(() => setStep('handle'));
  }, []);

  async function submitHandle() {
    const v = handle.trim().replace(/^@/, '');
    if (!v) return;
    sendUser(`@${v}`);
    setStep('stage');
    setStage(s => ({ ...s, handleSet: true }));
    await sendJovie([
      `Got it. jov.ie/${v} is yours.`,
      'Where are you in your career right now?',
    ]);
  }

  async function pickCareer(value: string) {
    sendUser(value);
    setCareer(value);
    setStep('working');
    await sendJovie([
      "What's working for you right now? What's getting traction?",
    ]);
  }

  async function answerWorking(value: string) {
    sendUser(value);
    setStep('stuck');
    await sendJovie(["And what's stuck? What do you wish was easier?"]);
  }

  async function answerStuck(value: string) {
    sendUser(value);
    // Gatekeeping branch: if "Just starting" and no traction, route to waitlist.
    if (career === 'Just starting' && /no|none|nothing|haven't/i.test(value)) {
      setStep('waitlist_intro');
      await sendJovie([
        "Honest take: where you're at, Jovie isn't going to move the needle for you yet. Here's what I'd do instead.",
        "I'll save everything we just talked about. When I'm ready for artists at your stage — I'm tracking exactly what you'd need — I'll send you an invite directly.",
      ]);
      setStep('waitlist_done');
      return;
    }
    setStep('connect_spotify');
    await sendJovie([
      "Got it. Let me pull in your catalog so I can see what we're working with.",
    ]);
  }

  async function connectSpotify() {
    sendUser('Connect Spotify');
    setStep('spotify_loading');
    setTyping(true);
    await sleep(1400);
    setTyping(false);
    setStage(s => ({ ...s, spotifyConnected: true }));
    setStep('pick_track');
    await sendJovie([
      'Okay — I see 12 tracks across 6 releases. Which one are you most proud of right now?',
    ]);
  }

  async function pickTrack(t: string) {
    sendUser(t);
    setPicked(t);
    setStep('goal');
    await sendJovie([
      `${t} is a great place to anchor. What do you most want me to help with this quarter?`,
    ]);
  }

  async function pickGoal(value: string) {
    sendUser(value);
    setStep('plan_recommend');
    await sendJovie([
      `For "${value}", Pro is what you want — it unlocks ${planUnlock(value)}.`,
      'Want to start a 14-day trial? Cancel anytime.',
    ]);
  }

  async function pickPlan(yes: boolean) {
    sendUser(yes ? 'Yes, start the trial' : 'Not yet');
    setStep('building');
    setStage(s => ({ ...s, planPicked: true }));
    await sendJovie(['Building your dashboard now.']);
    await sleep(1100);
    setStage(s => ({ ...s, ready: true }));
    setStep('ready');
    await sendJovie([
      `You're all set, ${handle.trim().replace(/^@/, '')}. Day-1 dashboard is shaped from what we just talked about — first three tasks already queued up around "${picked ?? 'your top track'}".`,
    ]);
  }

  return (
    <div
      className='h-dvh w-dvw flex overflow-hidden'
      style={
        {
          '--linear-bg-page': PALETTE.page,
          '--linear-bg-surface-0': PALETTE.surface0,
          '--linear-bg-surface-1': PALETTE.surface1,
          '--linear-bg-surface-2': PALETTE.surface2,
          '--linear-app-content-surface': PALETTE.contentSurface,
          '--linear-app-shell-border': PALETTE.border,
          background: PALETTE.page,
        } as React.CSSProperties
      }
    >
      {/* Sidebar — fades in only at ready */}
      <SidebarShim visible={stage.ready} handle={handle} />

      {/* Main column: chat + (eventually) audio bar */}
      <div className='flex-1 min-w-0 flex flex-col'>
        <main className='flex-1 min-h-0 flex'>
          {/* Chat pane (always present, narrows when right rail appears) */}
          <section
            className='flex-1 min-w-0 flex flex-col transition-[max-width] duration-500 ease-out'
            style={{
              maxWidth: stage.ready
                ? '720px'
                : stage.handleSet
                  ? 'calc(100vw - 360px)'
                  : '100vw',
            }}
          >
            <div
              ref={scrollRef}
              className='flex-1 min-h-0 overflow-y-auto px-6 lg:px-12 pt-12 pb-6'
            >
              <div className='max-w-2xl mx-auto space-y-5'>
                {messages.map(m => (
                  <ChatBubble key={m.id} msg={m} />
                ))}
                {typing && <TypingIndicator />}
                {step === 'waitlist_done' && <WaitlistCard />}
                {step === 'ready' && <ReadyCard handle={handle} />}
              </div>
            </div>

            {/* Composer — context-sensitive responses */}
            <div className='shrink-0 border-t border-(--linear-app-shell-border)/50 bg-(--linear-bg-page)/80 backdrop-blur-sm'>
              <div className='max-w-2xl mx-auto px-6 lg:px-12 py-4'>
                <Composer
                  step={step}
                  handle={handle}
                  setHandle={setHandle}
                  textInput={textInput}
                  setTextInput={setTextInput}
                  onSubmitHandle={submitHandle}
                  onPickCareer={pickCareer}
                  onAnswerWorking={answerWorking}
                  onAnswerStuck={answerStuck}
                  onConnectSpotify={connectSpotify}
                  onPickTrack={pickTrack}
                  onPickGoal={pickGoal}
                  onPickPlan={pickPlan}
                />
              </div>
            </div>
          </section>

          {/* Right rail — fades in after handle is set */}
          <RightRail
            visible={stage.handleSet}
            spotifyReady={stage.spotifyConnected}
            handle={handle}
            career={career}
            picked={picked}
          />
        </main>

        {/* Audio bar — fades in after plan picked */}
        <AudioBarShim
          visible={stage.planPicked}
          title={picked ?? TRACK_PICKS[0]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer

function Composer({
  step,
  handle,
  setHandle,
  textInput,
  setTextInput,
  onSubmitHandle,
  onPickCareer,
  onAnswerWorking,
  onAnswerStuck,
  onConnectSpotify,
  onPickTrack,
  onPickGoal,
  onPickPlan,
}: {
  step: Step;
  handle: string;
  setHandle: (h: string) => void;
  textInput: string;
  setTextInput: (t: string) => void;
  onSubmitHandle: () => void;
  onPickCareer: (value: string) => void;
  onAnswerWorking: (value: string) => void;
  onAnswerStuck: (value: string) => void;
  onConnectSpotify: () => void;
  onPickTrack: (t: string) => void;
  onPickGoal: (g: string) => void;
  onPickPlan: (yes: boolean) => void;
}) {
  if (step === 'handle') {
    const hasHandle = handle.trim().length > 0;
    return (
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmitHandle();
        }}
        className='flex items-center gap-2 h-12 pl-3 pr-1.5 rounded-full border border-(--linear-app-shell-border) bg-surface-1/60 focus-within:border-white/20 focus-within:bg-surface-1 transition-colors duration-150 ease-out'
      >
        <span className='text-[14px] text-tertiary-token tabular-nums'>
          jov.ie/
        </span>
        <FocusOnMountInput
          value={handle}
          onChange={setHandle}
          placeholder='you'
          className='flex-1 bg-transparent text-[14px] text-primary-token placeholder:text-quaternary-token outline-none'
        />
        <button
          type='submit'
          disabled={!hasHandle}
          aria-hidden={!hasHandle}
          tabIndex={hasHandle ? 0 : -1}
          className={cn(
            'h-9 rounded-full bg-white text-black text-[12.5px] font-caption tracking-[-0.005em] flex items-center gap-1.5 transition-all duration-200 ease-out',
            hasHandle
              ? 'opacity-100 translate-x-0 px-3.5 hover:brightness-110 active:scale-[0.98]'
              : 'opacity-0 -translate-x-2 px-0 w-0 overflow-hidden pointer-events-none'
          )}
        >
          <span className='whitespace-nowrap'>Claim</span>
          <ArrowRight className='h-3 w-3' strokeWidth={2.5} />
        </button>
      </form>
    );
  }

  if (step === 'stage') {
    return (
      <ChipRow
        chips={[
          'Just starting',
          'Independent and growing',
          'Established',
          'Major label',
        ]}
        onPick={onPickCareer}
      />
    );
  }

  if (step === 'working') {
    return (
      <FreeText
        value={textInput}
        setValue={setTextInput}
        placeholder='Streaming, live shows, sync, social, sales of physical…'
        onSubmit={() => {
          if (!textInput.trim()) return;
          onAnswerWorking(textInput.trim());
          setTextInput('');
        }}
        chips={[
          'Streaming is growing',
          'Live is selling',
          'Honestly nothing yet',
        ]}
      />
    );
  }

  if (step === 'stuck') {
    return (
      <FreeText
        value={textInput}
        setValue={setTextInput}
        placeholder='Pitching, releasing, marketing, paperwork…'
        onSubmit={() => {
          if (!textInput.trim()) return;
          onAnswerStuck(textInput.trim());
          setTextInput('');
        }}
        chips={[
          'Pitching is hard',
          'Releases take forever',
          "I haven't released anything yet",
        ]}
      />
    );
  }

  if (step === 'connect_spotify') {
    return (
      <button
        type='button'
        onClick={onConnectSpotify}
        className='w-full h-12 rounded-xl border border-(--linear-app-shell-border) bg-surface-1/60 hover:bg-surface-1 hover:border-cyan-500/30 text-[13px] font-caption text-secondary-token hover:text-primary-token transition-colors duration-150 ease-out flex items-center justify-center gap-2'
      >
        <span className='h-4 w-4 rounded-full bg-emerald-500' />
        Connect Spotify
      </button>
    );
  }

  if (step === 'pick_track') {
    return <ChipRow chips={TRACK_PICKS} onPick={onPickTrack} />;
  }

  if (step === 'goal') {
    return (
      <ChipRow
        chips={[
          'Get on more playlists',
          'Land press coverage',
          'Grow my mailing list',
          'Tour smarter',
        ]}
        onPick={onPickGoal}
      />
    );
  }

  if (step === 'plan_recommend') {
    return (
      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => onPickPlan(true)}
          className='flex-1 h-11 rounded-xl bg-white text-black text-[13px] font-caption tracking-[-0.005em] hover:brightness-110 active:scale-[0.99] transition-all duration-150 ease-out flex items-center justify-center gap-1.5'
        >
          Yes, start the trial{' '}
          <ArrowRight className='h-3.5 w-3.5' strokeWidth={2.5} />
        </button>
        <button
          type='button'
          onClick={() => onPickPlan(false)}
          className='h-11 px-4 rounded-xl border border-(--linear-app-shell-border) bg-surface-1/60 hover:bg-surface-1 text-[13px] font-caption text-secondary-token hover:text-primary-token transition-colors duration-150 ease-out'
        >
          Not yet
        </button>
      </div>
    );
  }

  // building / ready / waitlist — chat is read-only.
  return (
    <div className='h-12 grid place-items-center text-[12px] text-quaternary-token'>
      {/* Quiet placeholder — Jovie is finishing up. */}
      <span>—</span>
    </div>
  );
}

function ChipRow({
  chips,
  onPick,
}: {
  chips: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className='flex items-center gap-1.5 flex-wrap'>
      {chips.map(c => (
        <button
          key={c}
          type='button'
          onClick={() => onPick(c)}
          className='h-9 px-3 rounded-lg border border-(--linear-app-shell-border) bg-surface-1/40 hover:bg-surface-1 hover:border-cyan-500/30 hover:text-primary-token text-[12.5px] font-caption text-secondary-token transition-colors duration-150 ease-out'
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function FreeText({
  value,
  setValue,
  placeholder,
  chips,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
  chips?: string[];
  onSubmit: () => void;
}) {
  return (
    <div className='space-y-2'>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit();
        }}
        className='flex items-center gap-2 h-11 px-3 rounded-xl border border-(--linear-app-shell-border) bg-surface-1/60 focus-within:border-cyan-500/40 focus-within:bg-surface-1 transition-colors duration-150 ease-out'
      >
        <FocusOnMountInput
          value={value}
          onChange={setValue}
          placeholder={placeholder}
          className='flex-1 bg-transparent text-[13px] text-primary-token placeholder:text-tertiary-token outline-none'
        />
        <button
          type='button'
          className='h-7 w-7 rounded grid place-items-center text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out'
          aria-label='Hold to dictate (mock)'
          title='Hold to dictate'
        >
          <Mic className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
        <button
          type='submit'
          disabled={!value.trim()}
          className='h-7 w-7 rounded grid place-items-center text-cyan-300 disabled:opacity-30 hover:bg-cyan-500/10 transition-colors duration-150 ease-out'
          aria-label='Send'
        >
          <SendHorizonal className='h-3.5 w-3.5' strokeWidth={2.5} />
        </button>
      </form>
      {chips && chips.length > 0 && (
        <div className='flex items-center gap-1.5 flex-wrap'>
          {chips.map(c => (
            <button
              key={c}
              type='button'
              onClick={() => {
                setValue(c);
                setTimeout(onSubmit, 50);
              }}
              className='h-7 px-2.5 rounded-md border border-(--linear-app-shell-border) bg-surface-1/30 hover:bg-surface-1 text-[11.5px] text-tertiary-token hover:text-secondary-token transition-colors duration-150 ease-out'
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bubbles

function ChatBubble({ msg }: { msg: Msg }) {
  if (msg.role === 'jovie') {
    return (
      <div
        className='flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300'
        style={{ animationTimingFunction: EASE_CINEMATIC }}
      >
        <div className='h-7 w-7 rounded-full bg-surface-1 grid place-items-center shrink-0 mt-0.5'>
          <JovieMark className='h-3.5 w-3.5 text-cyan-400' />
        </div>
        <div className='flex-1 min-w-0'>
          <div className='text-[13.5px] leading-[1.55] text-primary-token tracking-[-0.005em]'>
            {msg.text}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className='flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-300'
      style={{ animationTimingFunction: EASE_CINEMATIC }}
    >
      <div className='max-w-[80%] rounded-2xl rounded-br-md bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-[13.5px] text-cyan-50/95 tracking-[-0.005em]'>
        {msg.text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className='flex items-start gap-2.5'>
      <div className='h-7 w-7 rounded-full bg-surface-1 grid place-items-center shrink-0 mt-0.5'>
        <JovieMark className='h-3.5 w-3.5 text-cyan-400' />
      </div>
      <div className='flex items-center gap-1 mt-2.5'>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-pulse'
            style={{
              animationDelay: `${i * 150}ms`,
              animationDuration: '900ms',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage shells

function RightRail({
  visible,
  spotifyReady,
  handle,
  career,
  picked,
}: {
  visible: boolean;
  spotifyReady: boolean;
  handle: string;
  career: string | null;
  picked: string | null;
}) {
  return (
    <aside
      className='hidden lg:flex flex-col w-[340px] shrink-0 border-l border-(--linear-app-shell-border)/60 bg-(--linear-app-content-surface) overflow-y-auto transition-[opacity,transform] duration-500 ease-out'
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(24px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className='p-5 space-y-4'>
        <div className='text-[10px] uppercase tracking-[0.12em] text-quaternary-token/85 font-medium'>
          Profile preview
        </div>
        <div className='rounded-xl border border-(--linear-app-shell-border) bg-surface-1/40 p-4'>
          <div className='flex items-center gap-3'>
            <div className='h-12 w-12 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 grid place-items-center text-[16px] font-caption text-secondary-token'>
              {(handle.replace('@', '').charAt(0) || 'J').toUpperCase()}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='text-[14px] font-caption text-primary-token tracking-[-0.012em] truncate'>
                @{handle.replace('@', '') || '—'}
              </div>
              <div className='text-[11.5px] text-tertiary-token truncate'>
                jov.ie/{handle.replace('@', '') || 'you'}
              </div>
            </div>
          </div>
          {career && (
            <div className='mt-3 inline-flex items-center h-[20px] px-2 rounded text-[10.5px] uppercase tracking-[0.06em] text-cyan-300/90 border border-cyan-500/30 bg-cyan-500/10'>
              {career}
            </div>
          )}
        </div>

        <div
          className='space-y-2 transition-opacity duration-500 ease-out'
          style={{ opacity: spotifyReady ? 1 : 0 }}
        >
          <div className='text-[10px] uppercase tracking-[0.12em] text-quaternary-token/85 font-medium pt-2'>
            Catalog (12)
          </div>
          <ul className='space-y-1'>
            {[
              ...TRACK_PICKS,
              'Bittersweet',
              'Ferris Wheel',
              'Pacific (Extended Mix)',
            ].map(t => (
              <li
                key={t}
                className={cn(
                  'flex items-center gap-2.5 h-8 rounded-md px-2 text-[12px]',
                  picked === t
                    ? 'bg-cyan-500/10 text-cyan-100/95 border border-cyan-500/20'
                    : 'text-secondary-token border border-transparent'
                )}
              >
                <span className='h-5 w-5 rounded-sm bg-surface-2 shrink-0' />
                <span className='truncate flex-1'>{t}</span>
                {picked === t && (
                  <CheckCircle2
                    className='h-3.5 w-3.5 text-cyan-400'
                    strokeWidth={2.5}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

function SidebarShim({
  visible,
  handle,
}: {
  visible: boolean;
  handle: string;
}) {
  return (
    <aside
      className='hidden lg:flex flex-col w-[224px] shrink-0 px-2 pt-3 pb-3 transition-[opacity,transform] duration-700 ease-out'
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(-32px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className='flex items-center gap-2.5 h-7 pl-3 pr-2'>
        <JovieMark className='h-4 w-4 shrink-0 text-primary-token' />
        <span className='text-[13.5px] font-semibold tracking-[-0.02em] text-primary-token'>
          Jovie
        </span>
      </div>
      <nav className='mt-5 px-1 space-y-px'>
        {['Inbox', 'Tasks'].map(label => (
          <div
            key={label}
            className='flex items-center gap-2.5 h-7 pl-3 pr-2 rounded-md text-[13px] text-secondary-token'
          >
            <span className='h-3.5 w-3.5 rounded-sm bg-surface-1' />
            {label}
          </div>
        ))}
      </nav>
      <div className='mt-5 px-3 pb-1'>
        <span className='text-[9.5px] font-medium uppercase tracking-[0.12em] text-quaternary-token/85'>
          Artists
        </span>
      </div>
      <div className='px-1'>
        <div className='flex items-center gap-2.5 h-7 pl-3 pr-2 rounded-md text-[13px] font-caption text-primary-token bg-cyan-500/10 shadow-[inset_2px_0_0_0_rgb(34_211_238)]'>
          <span className='h-2 w-2 rounded-full bg-cyan-400 ml-[3px]' />@
          {handle.replace('@', '') || 'you'}
        </div>
      </div>
    </aside>
  );
}

function AudioBarShim({ visible, title }: { visible: boolean; title: string }) {
  return (
    <div
      className='shrink-0 transition-[max-height,opacity] duration-700 ease-out overflow-hidden'
      style={{
        maxHeight: visible ? 56 : 0,
        opacity: visible ? 1 : 0,
      }}
    >
      <div className='h-14 px-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-(--linear-app-shell-border)/50'>
        <div className='flex items-center gap-2 min-w-0'>
          <span className='h-9 w-9 rounded-md bg-surface-1 grid place-items-center text-[12px] text-tertiary-token'>
            {title.charAt(0)}
          </span>
          <div className='min-w-0'>
            <div className='truncate text-[12.5px] font-caption text-primary-token'>
              {title}
            </div>
            <div className='truncate text-[10.5px] text-tertiary-token'>
              You · just added
            </div>
          </div>
        </div>
        <div className='justify-self-center flex items-center gap-2'>
          <span className='h-8 w-8 rounded-full bg-cyan-500/15 border border-cyan-500/30 grid place-items-center text-cyan-300'>
            <Sparkles className='h-3.5 w-3.5' strokeWidth={2.25} />
          </span>
        </div>
        <div className='justify-self-end' />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final cards

function ReadyCard({ handle }: { handle: string }) {
  const name = handle.replace('@', '') || 'you';
  return (
    <div
      className='mt-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 animate-in fade-in slide-in-from-bottom-2 duration-500'
      style={{ animationTimingFunction: EASE_CINEMATIC }}
    >
      <div className='flex items-center gap-2 text-[10.5px] uppercase tracking-[0.12em] text-cyan-300/85 font-medium'>
        <Sparkles className='h-3 w-3' strokeWidth={2.5} />
        Welcome home
      </div>
      <h3 className='mt-2 text-[18px] font-display tracking-[-0.02em] text-primary-token'>
        jov.ie/{name} is live.
      </h3>
      <p className='mt-2 text-[13px] text-secondary-token leading-[1.55]'>
        Your dashboard is shaped from this conversation. First three tasks are
        queued. Sidebar&apos;s open on the left.
      </p>
      <Link
        href='/exp/shell-v1'
        className='mt-4 inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white text-black text-[12.5px] font-caption tracking-[-0.005em] hover:brightness-110 active:scale-[0.99] transition-all duration-150 ease-out'
      >
        <LayoutDashboard className='h-3.5 w-3.5' strokeWidth={2.5} />
        Open dashboard
        <ChevronRight className='h-3.5 w-3.5' strokeWidth={2.5} />
      </Link>
    </div>
  );
}

function WaitlistCard() {
  return (
    <div
      className='mt-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 animate-in fade-in slide-in-from-bottom-2 duration-500'
      style={{ animationTimingFunction: EASE_CINEMATIC }}
    >
      <div className='flex items-center gap-2 text-[10.5px] uppercase tracking-[0.12em] text-amber-300/90 font-medium'>
        Saved for later
      </div>
      <h3 className='mt-2 text-[18px] font-display tracking-[-0.02em] text-primary-token'>
        On the early-access list.
      </h3>
      <p className='mt-2 text-[13px] text-secondary-token leading-[1.55]'>
        Your transcript is saved. When I&apos;m ready to help where you&apos;re
        at — the gaps you mentioned are exactly what we&apos;re tracking —
        I&apos;ll send you a personal invite.
      </p>
      <p className='mt-3 text-[11.5px] text-tertiary-token'>
        Admin view: this conversation feeds the feature-request queue.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers

function FocusOnMountInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <input
      ref={ref}
      type='text'
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function planUnlock(goal: string): string {
  if (goal.includes('playlist'))
    return 'editorial pitch generation, playlist health monitoring, and curator outreach automation';
  if (goal.includes('press'))
    return 'press kit generation, journalist contact intelligence, and one-tap pitch sends';
  if (goal.includes('mailing'))
    return 'fan capture flows, segment-aware email drafts, and post-show follow-ups';
  if (goal.includes('Tour'))
    return 'tour radius routing, capacity-fit venue matching, and city-by-city promo plans';
  return 'the analytics, automation, and ai assistant tier';
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
