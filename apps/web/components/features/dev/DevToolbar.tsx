'use client';

import { Button } from '@jovie/ui';
import {
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Flag,
  Globe,
  Loader2,
  Monitor,
  Moon,
  PanelsTopLeft,
  RefreshCw,
  Route,
  Search,
  Sun,
  Trash2,
  UserCheck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import { useAppFlag, useStoredAppFlagOverrides } from '@/lib/flags/client';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_OVERRIDE_KEYS,
  DESIGN_V1_ALIAS_FLAGS,
} from '@/lib/flags/contracts';
import {
  registerServiceWorker,
  SW_ENABLED_KEY,
  unregisterServiceWorker,
} from '@/lib/service-worker/control';
import { FlagRow, OrphanOverrides, PlanToggle } from './DevToolbarRows';
import { useFlagBadges } from './FlagBadgeContext';

type FlagEntry = {
  name: string;
  key: string;
  source: 'code';
  serverDefault: boolean;
};

const ALL_FLAGS: FlagEntry[] = (
  Object.entries(APP_FLAG_OVERRIDE_KEYS) as [string, string][]
)
  .filter(
    ([name]) => !(DESIGN_V1_ALIAS_FLAGS as readonly string[]).includes(name)
  )
  .map(([name, key]) => ({
    name,
    key,
    source: 'code' as const,
    serverDefault: APP_FLAG_DEFAULTS[name as keyof typeof APP_FLAG_DEFAULTS],
  }));

/**
 * Lookup table: override-storage-key -> server default. Used to detect
 * "meaningful" overrides (where the override value diverges from the
 * server default) so the badge count + override pill don't show stale
 * no-op overrides that match production state.
 */
const OVERRIDE_KEY_TO_SERVER_DEFAULT: Record<string, boolean> =
  Object.fromEntries(ALL_FLAGS.map(flag => [flag.key, flag.serverDefault]));

function isMeaningfulOverride(key: string, value: boolean): boolean {
  // Unknown key (legacy entry from a removed flag) — treat as meaningful so
  // the user can still see and clear it from the UI.
  if (!(key in OVERRIDE_KEY_TO_SERVER_DEFAULT)) return true;
  return value !== OVERRIDE_KEY_TO_SERVER_DEFAULT[key];
}

const BREAKPOINTS = [
  { name: '2xl', min: 1536 },
  { name: 'xl', min: 1280 },
  { name: 'lg', min: 1024 },
  { name: 'md', min: 768 },
  { name: 'sm', min: 640 },
] as const;

function useBreakpoint() {
  const [bp, setBp] = useState('xs');
  useEffect(() => {
    const update = () => {
      const w = globalThis.innerWidth;
      const match = BREAKPOINTS.find(b => w >= b.min);
      setBp(match?.name ?? 'xs');
    };
    update();
    globalThis.addEventListener('resize', update);
    return () => globalThis.removeEventListener('resize', update);
  }, []);
  return bp;
}

const TOOLBAR_STORAGE_KEY = '__dev_toolbar_open';
const TOOLBAR_HIDDEN_KEY = '__dev_toolbar_hidden';

const ENV_COLORS: Record<string, string> = {
  production: 'bg-red-500/20 text-red-400 border-red-500/30',
  preview: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

type DevTestAuthPersona = 'creator' | 'creator-ready' | 'admin';

type DevTestAuthSessionStatus = {
  readonly enabled: boolean;
  readonly trustedHost: boolean;
  readonly active: boolean;
  readonly persona: DevTestAuthPersona | null;
  readonly userId: string | null;
  readonly email: string | null;
  readonly profilePath: string | null;
  readonly reason: string | null;
};

type PersonaActionState = DevTestAuthPersona | 'exit' | null;

const PERSONA_OPTIONS: readonly {
  readonly persona: DevTestAuthPersona;
  readonly label: string;
  readonly meta: string;
  readonly description: string;
}[] = [
  {
    persona: 'creator',
    label: 'Free Creator',
    meta: 'Free, Non-Admin',
    description: 'Incomplete onboarding baseline.',
  },
  {
    persona: 'creator-ready',
    label: 'Pro Creator',
    meta: 'Pro, Non-Admin',
    description: 'Dashboard-ready QA baseline.',
  },
  {
    persona: 'admin',
    label: 'Admin',
    meta: 'Admin Shell',
    description: 'Admin navigation and access baseline.',
  },
];

type AsyncActionState = 'idle' | 'loading' | 'done' | 'error';

const ASYNC_ACTION_LABELS: Record<string, Record<AsyncActionState, string>> = {
  clear: {
    idle: 'Clear',
    loading: 'Clearing...',
    done: 'Cleared!',
    error: 'Failed',
  },
  unwaitlist: {
    idle: 'Unwaitlist',
    loading: 'Working...',
    done: 'Done!',
    error: 'Failed',
  },
};

type PromoteState =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'promoting'
  | 'done'
  | 'error';

const PROMOTE_LABELS: Record<PromoteState, string> = {
  idle: 'Promote',
  checking: 'Promote',
  ready: 'Promote',
  promoting: 'Deploying...',
  done: 'Deployed!',
  error: 'Failed',
};

function getPromoteButtonColor(state: PromoteState): string {
  if (state === 'done') return 'text-accent';
  if (state === 'error') return 'text-red-400';
  return 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10';
}

function AsyncActionIcon({
  state,
  idleIcon: IdleIcon,
}: Readonly<{
  state: AsyncActionState;
  idleIcon: typeof Trash2;
}>) {
  if (state === 'loading')
    return <Loader2 size={11} className='animate-spin' />;
  if (state === 'done') return <Check size={11} className='text-accent' />;
  return <IdleIcon size={11} />;
}

function PromoteIcon({ state }: Readonly<{ state: PromoteState }>) {
  if (state === 'promoting')
    return <Loader2 size={11} className='animate-spin' />;
  if (state === 'done') return <Check size={11} />;
  return <ArrowUpCircle size={11} />;
}

function CopyFieldIcon({
  copied,
  icon: Icon,
}: Readonly<{ copied: boolean; icon: typeof Copy }>) {
  if (copied) return <Check size={11} className='text-accent' />;
  return <Icon size={11} />;
}

function ExpandCollapseIcon({ open }: Readonly<{ open: boolean }>) {
  if (open) return <ChevronDown size={13} />;
  return <ChevronUp size={13} />;
}

function getSwButtonProps(enabled: boolean) {
  return {
    title: enabled
      ? 'Service worker active — click to disable'
      : 'Service worker disabled — click to enable',
    className: `h-auto flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
      enabled
        ? 'text-accent bg-accent/10'
        : 'text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2'
    }`,
    'aria-label': enabled ? 'Disable service worker' : 'Enable service worker',
  };
}

function getPromoteTitle(
  promoteSha: { staging: string; prod: string } | null
): string {
  if (promoteSha) {
    return `Promote ${promoteSha.staging} → prod (currently ${promoteSha.prod})`;
  }
  return 'Promote to production';
}

export function DevToolbar({
  env,
  sha,
  version,
}: Readonly<{
  env: string;
  sha: string;
  version: string;
}>) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [copiedField, setCopiedField] = useState<'sha' | 'route' | null>(null);
  const [syncClerkState, setSyncClerkState] = useState<
    'idle' | 'loading' | 'done' | 'noop' | 'error'
  >('idle');
  const [unwaitlistState, setUnwaitlistState] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle');
  const [clearSessionState, setClearSessionState] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle');
  const [personaPanelOpen, setPersonaPanelOpen] = useState(false);
  const [personaSession, setPersonaSession] =
    useState<DevTestAuthSessionStatus | null>(null);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [personaAction, setPersonaAction] = useState<PersonaActionState>(null);
  const personaStatusAbortRef = useRef<AbortController | null>(null);
  const [swEnabled, setSwEnabled] = useState(false);
  const [promoteState, setPromoteState] = useState<
    'idle' | 'checking' | 'ready' | 'promoting' | 'done' | 'error'
  >('idle');
  const [promoteSha, setPromoteSha] = useState<{
    staging: string;
    prod: string;
  } | null>(null);
  const { theme, setTheme } = useTheme();
  const overridesCtx = useStoredAppFlagOverrides();
  const designV1Enabled = useAppFlag('DESIGN_V1');
  const flagBadgeCtx = useFlagBadges();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const breakpoint = useBreakpoint();

  // Flash state lives at DevToolbar level (not per-row) so toggling a flag
  // that re-categorizes between Overrides <-> non-Overrides sections still
  // shows the visual confirmation on the new row position. Per-row state
  // would reset on remount and the flash would never play.
  const [flashedKey, setFlashedKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashFlag = useCallback((key: string) => {
    setFlashedKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashedKey(null), 400);
  }, []);
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Restore state from localStorage and mark as mounted
  useEffect(() => {
    setMounted(true);
    setOpen(localStorage.getItem(TOOLBAR_STORAGE_KEY) === '1');
    setHidden(localStorage.getItem(TOOLBAR_HIDDEN_KEY) === '1');
    setSwEnabled(localStorage.getItem(SW_ENABLED_KEY) === '1');
  }, []);

  // Keyboard shortcut: Cmd+Shift+D (Mac) / Ctrl+Shift+D (other)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isToggleShortcut =
        e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'd';
      if (isToggleShortcut) {
        e.preventDefault();
        const nextHidden = !hidden;
        setHidden(nextHidden);
        localStorage.setItem(TOOLBAR_HIDDEN_KEY, nextHidden ? '1' : '0');
        return;
      }
      // Cmd+Shift+F: toggle flag badges
      const isBadgeShortcut =
        e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'f';
      if (isBadgeShortcut) {
        e.preventDefault();
        flagBadgeCtx?.toggleBadges();
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        localStorage.setItem(TOOLBAR_STORAGE_KEY, '0');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hidden, open, flagBadgeCtx]);

  // Expose toolbar height as a CSS variable so scrollable content areas can
  // add their own bottom padding without shrinking the full-viewport app shell.
  useEffect(() => {
    if (hidden) {
      document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
      return;
    }
    const updateVar = () => {
      const h = toolbarRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty(
        '--dev-toolbar-height',
        h > 0 ? `${h}px` : '0px'
      );
    };
    updateVar();
    const timer = setTimeout(updateVar, 220);
    return () => {
      clearTimeout(timer);
      document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
    };
  }, [open, hidden]);

  // Poll deploy status for promote button (preview only, when toolbar visible)
  useEffect(() => {
    if (env !== 'preview' || hidden) return;
    let active = true;

    async function checkStatus() {
      try {
        setPromoteState(prev => (prev === 'idle' ? 'checking' : prev));
        const res = await fetch('/api/deploy/status');
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        setPromoteSha({
          staging: data.stagingSha,
          prod: data.prodSha,
        });
        setPromoteState(prev => {
          if (prev === 'promoting' || prev === 'done') return prev;
          return data.needsPromote ? 'ready' : 'idle';
        });
      } catch {
        // Silent fail — status is best-effort
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [env, hidden]);

  const refreshPersonaSession = useCallback(async () => {
    if (env === 'production') return;

    personaStatusAbortRef.current?.abort();
    const controller = new AbortController();
    personaStatusAbortRef.current = controller;
    setPersonaLoading(true);
    setPersonaError(null);
    try {
      const res = await fetch('/api/dev/test-auth/session', {
        signal: controller.signal,
      });
      const data = (await res.json()) as DevTestAuthSessionStatus;
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setPersonaError(data.reason ?? 'Persona status unavailable');
        return;
      }
      setPersonaSession(data);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        return;
      }
      setPersonaError('Persona status unavailable');
    } finally {
      if (personaStatusAbortRef.current === controller) {
        personaStatusAbortRef.current = null;
        if (!controller.signal.aborted) {
          setPersonaLoading(false);
        }
      }
    }
  }, [env]);

  useEffect(() => {
    if (!personaPanelOpen) {
      personaStatusAbortRef.current?.abort();
      personaStatusAbortRef.current = null;
      setPersonaLoading(false);
      return;
    }
    refreshPersonaSession();
    return () => {
      personaStatusAbortRef.current?.abort();
      personaStatusAbortRef.current = null;
    };
  }, [personaPanelOpen, refreshPersonaSession]);

  async function handlePromote() {
    setPromoteState('promoting');
    try {
      const res = await fetch('/api/deploy/promote', { method: 'POST' });
      if (res.ok) {
        setPromoteState('done');
        setTimeout(() => setPromoteState('idle'), 120_000);
      } else if (res.status === 429) {
        setPromoteState('ready');
      } else {
        setPromoteState('error');
        setTimeout(() => setPromoteState('ready'), 3000);
      }
    } catch {
      setPromoteState('error');
      setTimeout(() => setPromoteState('ready'), 3000);
    }
  }

  async function handleSelectPersona(persona: DevTestAuthPersona) {
    if (personaAction || personaSession?.persona === persona) return;

    setPersonaAction(persona);
    setPersonaError(null);
    try {
      const res = await fetch('/api/dev/test-auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (res.ok && data?.success) {
        globalThis.location.reload();
        return;
      }
      setPersonaError(data?.error ?? 'Persona switch failed');
    } catch {
      setPersonaError('Persona switch failed');
    } finally {
      setPersonaAction(null);
    }
  }

  async function handleExitPersona() {
    if (personaAction) return;

    setPersonaAction('exit');
    setPersonaError(null);
    try {
      const res = await fetch('/api/dev/test-auth/session', {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (res.ok && data?.success) {
        globalThis.location.reload();
        return;
      }
      setPersonaError(data?.error ?? 'Exit persona failed');
    } catch {
      setPersonaError('Exit persona failed');
    } finally {
      setPersonaAction(null);
    }
  }

  function toggleOpen() {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(TOOLBAR_STORAGE_KEY, next ? '1' : '0');
      if (next) {
        setTimeout(() => searchRef.current?.focus(), 220);
      }
      return next;
    });
  }

  const hide = useCallback(() => {
    setHidden(true);
    localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
  }, []);

  const show = useCallback(() => {
    setHidden(false);
    localStorage.setItem(TOOLBAR_HIDDEN_KEY, '0');
  }, []);

  const overrides = useMemo(
    () => overridesCtx.overrides,
    [overridesCtx.overrides]
  );
  const validOverrides = overridesCtx.validOverrides;
  const orphanKeys = overridesCtx.orphanKeys;
  const overrideCount = useMemo(
    () =>
      Object.entries(validOverrides).filter(([key, value]) =>
        isMeaningfulOverride(key, value)
      ).length,
    [validOverrides]
  );
  const designV1OverrideKey = APP_FLAG_OVERRIDE_KEYS.DESIGN_V1;
  const designV1Overridden =
    designV1OverrideKey in overrides &&
    isMeaningfulOverride(
      designV1OverrideKey,
      overrides[designV1OverrideKey] as boolean
    );

  /**
   * Set an override unless the new value matches the server default — in
   * which case clear the override so the count stays accurate and stale
   * no-op overrides don't accumulate. Read current state from the
   * `overrides` map directly (not from `useAppFlag` closure) so rapid
   * double-clicks don't race against a pending re-render.
   */
  const setOrClearOverride = useCallback(
    (key: string, value: boolean) => {
      if (
        key in OVERRIDE_KEY_TO_SERVER_DEFAULT &&
        value === OVERRIDE_KEY_TO_SERVER_DEFAULT[key]
      ) {
        overridesCtx.removeOverride(key);
      } else {
        overridesCtx.setOverride(key, value);
      }
      flashFlag(key);
    },
    [flashFlag, overridesCtx]
  );

  const toggleDesignV1 = useCallback(() => {
    const currentOverride = overrides[designV1OverrideKey];
    const current =
      typeof currentOverride === 'boolean' ? currentOverride : designV1Enabled;
    setOrClearOverride(designV1OverrideKey, !current);
  }, [designV1Enabled, designV1OverrideKey, overrides, setOrClearOverride]);

  // Unified flag list: filter by search, sort overrides to top
  const filteredFlags = useMemo(() => {
    const query = search.toLowerCase();
    const matched = query
      ? ALL_FLAGS.filter(f =>
          f.name.toLowerCase().replaceAll('_', ' ').includes(query)
        )
      : ALL_FLAGS;

    const overridden = matched.filter(f => f.key in overrides);
    const nonOverridden = matched.filter(f => !(f.key in overrides));
    return { overridden, nonOverridden, total: ALL_FLAGS.length };
  }, [search, overrides]);

  const matchCount =
    filteredFlags.overridden.length + filteredFlags.nonOverridden.length;

  async function copyToClipboard(text: string, field: 'sha' | 'route') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard not available — fail silently
    }
  }

  async function handleUnwaitlist() {
    setUnwaitlistState('loading');
    try {
      const res = await fetch('/api/dev/unwaitlist', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setUnwaitlistState('done');
        setTimeout(() => globalThis.location.reload(), 500);
      } else {
        setUnwaitlistState('error');
        setTimeout(() => setUnwaitlistState('idle'), 3000);
      }
    } catch {
      setUnwaitlistState('error');
      setTimeout(() => setUnwaitlistState('idle'), 3000);
    }
  }

  async function handleSyncClerk() {
    setSyncClerkState('loading');
    try {
      const res = await fetch('/api/dev/sync-clerk', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        if (data.synced) {
          setSyncClerkState('done');
          setTimeout(() => globalThis.location.reload(), 500);
        } else {
          setSyncClerkState('noop');
          setTimeout(() => setSyncClerkState('idle'), 2000);
        }
      } else {
        setSyncClerkState('error');
        setTimeout(() => setSyncClerkState('idle'), 3000);
      }
    } catch {
      setSyncClerkState('error');
      setTimeout(() => setSyncClerkState('idle'), 3000);
    }
  }

  async function handleClearSession() {
    setClearSessionState('loading');
    try {
      const res = await fetch('/api/dev/clear-session', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        // Preserve toolbar state, clear everything else from localStorage
        const toolbarOpen = localStorage.getItem(TOOLBAR_STORAGE_KEY);
        const toolbarHidden = localStorage.getItem(TOOLBAR_HIDDEN_KEY);
        localStorage.clear();
        if (toolbarOpen !== null)
          localStorage.setItem(TOOLBAR_STORAGE_KEY, toolbarOpen);
        if (toolbarHidden !== null)
          localStorage.setItem(TOOLBAR_HIDDEN_KEY, toolbarHidden);

        // Clear sessionStorage entirely
        sessionStorage.clear();

        // Clear non-HttpOnly cookies client-side (belt + suspenders)
        for (const cookie of document.cookie.split(';')) {
          const name = cookie.split('=')[0].trim();
          if (!name || name.startsWith('__dev_toolbar')) continue;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }

        setClearSessionState('done');
        setTimeout(() => globalThis.location.reload(), 500);
      } else {
        setClearSessionState('error');
        setTimeout(() => setClearSessionState('idle'), 3000);
      }
    } catch {
      setClearSessionState('error');
      setTimeout(() => setClearSessionState('idle'), 3000);
    }
  }

  const envColor =
    ENV_COLORS[env] ?? 'bg-green-500/20 text-green-400 border-green-500/30';

  if (!mounted) return null;

  if (hidden) {
    return (
      <Button
        type='button'
        variant='ghost'
        onClick={show}
        data-testid='dev-toolbar'
        className='fixed bottom-3 right-3 z-[9999] h-auto gap-1.5 px-2.5 py-1.5 rounded-lg border border-default bg-surface-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) hover:border-default shadow-md font-mono text-3xs transition-colors'
        aria-label='Show Dev Toolbar'
        title='Show Dev Toolbar (⌘⇧D)'
      >
        <Wrench size={11} />
        Dev
      </Button>
    );
  }

  return (
    <div
      ref={toolbarRef}
      data-testid='dev-toolbar'
      className='fixed bottom-0 left-0 right-0 z-[9999] font-mono text-xs'
    >
      {/* Expanded panel */}
      <div
        className='overflow-hidden border-t border-default backdrop-blur-sm bg-surface-1/80'
        style={{
          maxHeight: open ? '400px' : '0px',
          borderTopWidth: open ? undefined : 0,
          transitionDuration: 'var(--duration-subtle)',
          transitionProperty: 'max-height, border-top-width',
          transitionTimingFunction: 'var(--ease-subtle)',
        }}
      >
        <div className='flex flex-col'>
          {/* Search bar */}
          <div className='flex items-center gap-2 px-4 py-2 border-b border-subtle'>
            <Search size={12} className='shrink-0 text-quaternary-token' />
            <input
              ref={searchRef}
              type='text'
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder='Search flags...'
              className='flex-1 bg-transparent text-(--color-text-primary) placeholder:text-quaternary-token outline-none text-xs'
              aria-label='Search Flags'
            />
            {search && (
              <Button
                type='button'
                variant='ghost'
                onClick={() => setSearch('')}
                className='h-auto w-auto shrink-0 p-0 text-quaternary-token hover:bg-transparent hover:text-(--color-text-primary) transition-colors'
                aria-label='Clear Search'
              >
                <X size={11} />
              </Button>
            )}
            <span className='shrink-0 text-3xs text-quaternary-token'>
              {matchCount} of {filteredFlags.total}
            </span>
          </div>

          {/* Flags list */}
          <div className='px-4 py-2 max-h-48 overflow-y-auto'>
            {/* Overridden flags group */}
            {filteredFlags.overridden.length > 0 && (
              <div className='mb-2 border-l-2 border-accent pl-3'>
                <div className='flex items-center justify-between mb-1'>
                  <span className='text-3xs font-semibold uppercase tracking-wide text-accent'>
                    Overrides ({filteredFlags.overridden.length})
                  </span>
                  <Button
                    type='button'
                    variant='link'
                    onClick={overridesCtx.clearOverrides}
                    className='text-3xs text-(--color-text-tertiary) hover:text-(--color-text-primary) underline transition-colors'
                  >
                    Clear All
                  </Button>
                </div>
                <div className='flex flex-col gap-0.5'>
                  {filteredFlags.overridden.map(flag => (
                    <FlagRow
                      key={flag.key}
                      label={flag.name.toLowerCase().replaceAll('_', ' ')}
                      flashing={flashedKey === flag.key}
                      isOverridden
                      checked={overrides[flag.key]}
                      serverDefault={flag.serverDefault}
                      onCheckedChange={v => setOrClearOverride(flag.key, v)}
                      onClear={() => overridesCtx.removeOverride(flag.key)}
                      source={flag.source}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Orphan overrides — keys in localStorage that no longer match the contract */}
            {orphanKeys.length > 0 && !search && (
              <OrphanOverrides
                keys={orphanKeys}
                onPurge={overridesCtx.purgeOrphans}
              />
            )}

            {/* Non-overridden flags */}
            {filteredFlags.nonOverridden.length > 0 && (
              <div className='flex flex-col gap-0.5'>
                {filteredFlags.nonOverridden.map(flag => {
                  const checked =
                    flag.source === 'code' ? flag.serverDefault : false;
                  return (
                    <FlagRow
                      key={flag.key}
                      label={flag.name.toLowerCase().replaceAll('_', ' ')}
                      flashing={flashedKey === flag.key}
                      isOverridden={false}
                      checked={checked}
                      onCheckedChange={v => setOrClearOverride(flag.key, v)}
                      onClear={() => overridesCtx.removeOverride(flag.key)}
                      source={flag.source}
                    />
                  );
                })}
              </div>
            )}

            {/* Empty search state */}
            {matchCount === 0 && search && (
              <div className='py-3 text-center text-quaternary-token'>
                No flags match &lsquo;{search}&rsquo;
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar (always visible) */}
      <div className='relative flex items-center h-9 px-4 gap-2 border-t border-default backdrop-blur-sm bg-surface-1/80 shadow-[0_-2px_8px_rgba(0,0,0,0.1)]'>
        {/* Center: brand logo */}
        <div className='absolute left-1/2 -translate-x-1/2 pointer-events-none'>
          <BrandLogo size={16} tone='auto' aria-hidden rounded={false} />
        </div>
        {/* Left: env + version */}
        <span
          className={`px-2 py-0.5 rounded border text-3xs font-semibold shrink-0 ${envColor}`}
        >
          {env}
        </span>
        {sha && (
          <span className='max-sm:hidden sm:inline text-quaternary-token truncate'>
            {sha}
          </span>
        )}
        {version && (
          <span className='max-sm:hidden sm:inline text-quaternary-token shrink-0'>
            v{version}
          </span>
        )}

        {/* Override badge */}
        {overrideCount > 0 && (
          <Button
            type='button'
            variant='ghost'
            onClick={() => {
              if (!open) toggleOpen();
            }}
            className='h-auto px-2 py-0.5 rounded-full text-3xs font-medium bg-accent/10 text-accent border border-accent/30 shrink-0 hover:bg-accent/20 transition-colors cursor-pointer'
            title='View overrides'
          >
            {overrideCount} {overrideCount === 1 ? 'override' : 'overrides'}
          </Button>
        )}

        <span className='max-md:hidden md:inline px-1.5 py-0.5 rounded text-3xs text-quaternary-token bg-surface-2 shrink-0'>
          {breakpoint}
        </span>

        <Button
          type='button'
          variant='ghost'
          aria-pressed={designV1Enabled}
          title='Toggle New Design (DESIGN_V1)'
          onClick={toggleDesignV1}
          className={`h-auto shrink-0 gap-1 px-1.5 py-1 rounded text-3xs transition-colors ${
            designV1Enabled
              ? 'text-accent bg-accent/10 hover:bg-accent/15'
              : 'text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2'
          }`}
        >
          <span>New Design</span>
          {designV1Overridden && (
            <span className='text-3xs opacity-70'>(override)</span>
          )}
        </Button>

        <div className='flex-1' />

        {/* Quick actions */}
        <div className='flex items-center gap-0.5'>
          {/* Flag badges toggle */}
          <Button
            type='button'
            variant='ghost'
            onClick={() => flagBadgeCtx?.toggleBadges()}
            title={`${flagBadgeCtx?.showBadges ? 'Hide' : 'Show'} flag badges (⌘⇧F)`}
            className={`h-auto w-auto p-1.5 rounded transition-colors ${
              flagBadgeCtx?.showBadges
                ? 'text-accent bg-accent/10'
                : 'text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2'
            }`}
            aria-label='Toggle Flag Badges'
          >
            <Flag size={12} />
          </Button>

          <div className='w-px h-4 mx-1 bg-subtle' />

          {/* Theme picker */}
          {[
            { value: 'dark', icon: Moon, label: 'Dark Theme' },
            { value: 'light', icon: Sun, label: 'Light Theme' },
            { value: 'system', icon: Monitor, label: 'System Theme' },
          ].map(({ value, icon: Icon, label }) => (
            <Button
              type='button'
              variant='ghost'
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              className={`h-auto p-1.5 rounded transition-colors ${
                mounted && theme === value
                  ? 'text-accent bg-accent/10'
                  : 'text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2'
              }`}
              aria-label={label}
            >
              <Icon size={12} />
            </Button>
          ))}

          <div className='w-px h-4 mx-1 bg-subtle' />

          {sha && (
            <Button
              type='button'
              variant='ghost'
              onClick={() => copyToClipboard(sha, 'sha')}
              title={`Copy SHA: ${sha}`}
              className='h-auto gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors'
              aria-label='Copy SHA'
            >
              <CopyFieldIcon copied={copiedField === 'sha'} icon={Copy} />
              <span className='max-sm:hidden sm:inline text-3xs'>SHA</span>
            </Button>
          )}

          <Button
            type='button'
            variant='ghost'
            onClick={() =>
              copyToClipboard(globalThis.location.pathname, 'route')
            }
            title={`Copy Route: ${globalThis.window === undefined ? '' : globalThis.location.pathname}`}
            className='h-auto gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors'
            aria-label='Copy Route'
          >
            <CopyFieldIcon copied={copiedField === 'route'} icon={Route} />
            <span className='max-sm:hidden sm:inline text-3xs'>Route</span>
          </Button>

          {designV1Enabled && (
            <Link
              href={APP_ROUTES.DESIGN_STUDIO}
              title='Open Design Studio'
              className='flex items-center gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors'
              aria-label='Design Studio'
            >
              <PanelsTopLeft size={11} />
              <span className='max-sm:hidden sm:inline text-3xs'>
                Design Studio
              </span>
            </Link>
          )}

          <Link
            href={APP_ROUTES.ADMIN}
            title='Open Admin Panel'
            className='flex items-center gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors'
            aria-label='Admin Panel'
          >
            <ExternalLink size={11} />
            <span className='max-sm:hidden sm:inline text-3xs'>Admin</span>
          </Link>

          {env !== 'production' && (
            <div className='relative'>
              <Button
                type='button'
                variant='ghost'
                onClick={() => setPersonaPanelOpen(value => !value)}
                title='Switch test persona'
                aria-label='Test Persona'
                aria-expanded={personaPanelOpen}
                aria-haspopup='menu'
                className={`h-auto flex items-center gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors ${
                  personaSession?.active ? 'text-accent bg-accent/10' : ''
                }`}
              >
                <UserRound size={11} />
                <span className='max-sm:hidden sm:inline text-3xs'>
                  Persona
                </span>
              </Button>

              {personaPanelOpen && (
                <div
                  role='menu'
                  className='absolute bottom-full right-0 mb-2 w-72 overflow-hidden rounded-md border border-default bg-surface-1 text-(--color-text-primary) shadow-lg'
                >
                  <div className='border-b border-subtle px-3 py-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-2xs font-medium'>Test Persona</span>
                      {personaLoading && (
                        <Loader2
                          size={11}
                          className='animate-spin text-quaternary-token'
                        />
                      )}
                    </div>
                    <p className='mt-1 truncate text-3xs text-quaternary-token'>
                      {personaSession?.active
                        ? `Active: ${personaSession.email ?? personaSession.userId ?? 'test user'}`
                        : 'No test persona active'}
                    </p>
                    {personaSession?.active && personaSession.profilePath && (
                      <p className='mt-0.5 truncate text-3xs text-quaternary-token'>
                        {personaSession.profilePath}
                      </p>
                    )}
                  </div>

                  {personaSession &&
                  (!personaSession.enabled || !personaSession.trustedHost) ? (
                    <div className='px-3 py-3 text-3xs text-(--color-text-tertiary)'>
                      {personaSession.reason ??
                        'Test personas are unavailable on this host.'}
                    </div>
                  ) : (
                    <div className='py-1'>
                      {PERSONA_OPTIONS.map(option => {
                        const isActive =
                          personaSession?.persona === option.persona;
                        const isSwitching = personaAction === option.persona;
                        return (
                          <Button
                            key={option.persona}
                            type='button'
                            variant='ghost'
                            role='menuitem'
                            disabled={Boolean(personaAction) || isActive}
                            onClick={() => handleSelectPersona(option.persona)}
                            className='h-auto w-full justify-start rounded-none flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-75'
                          >
                            <span className='flex size-4 shrink-0 items-center justify-center text-accent'>
                              {isSwitching ? (
                                <Loader2 size={12} className='animate-spin' />
                              ) : isActive ? (
                                <Check size={12} />
                              ) : null}
                            </span>
                            <span className='min-w-0 flex-1'>
                              <span className='flex items-center justify-between gap-2'>
                                <span className='truncate text-2xs font-medium'>
                                  {option.label}
                                </span>
                                <span className='shrink-0 text-3xs text-quaternary-token'>
                                  {option.meta}
                                </span>
                              </span>
                              <span className='block truncate text-3xs text-(--color-text-tertiary)'>
                                {option.description}
                              </span>
                            </span>
                          </Button>
                        );
                      })}

                      {personaSession?.active && (
                        <Button
                          type='button'
                          variant='ghost'
                          role='menuitem'
                          disabled={Boolean(personaAction)}
                          onClick={handleExitPersona}
                          className='mt-1 h-auto w-full justify-start rounded-none flex items-center gap-2 border-t border-subtle px-3 py-2 text-left text-2xs text-(--color-text-tertiary) transition-colors hover:bg-surface-2 hover:text-(--color-text-primary) disabled:cursor-not-allowed disabled:opacity-50'
                        >
                          <span className='flex size-4 shrink-0 items-center justify-center'>
                            {personaAction === 'exit' ? (
                              <Loader2 size={12} className='animate-spin' />
                            ) : (
                              <X size={12} />
                            )}
                          </span>
                          Exit Persona
                        </Button>
                      )}
                    </div>
                  )}

                  {personaError && (
                    <div className='border-t border-subtle px-3 py-2 text-3xs text-red-400'>
                      {personaError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Plan toggle — self-contained, safe outside QueryClientProvider */}
          <PlanToggle />

          {env !== 'production' && (
            <Button
              type='button'
              variant='ghost'
              onClick={handleClearSession}
              disabled={
                clearSessionState === 'loading' || clearSessionState === 'done'
              }
              title='Clear all cookies, localStorage, and sessionStorage'
              className='h-auto flex items-center gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              aria-label='Clear Session'
            >
              <AsyncActionIcon state={clearSessionState} idleIcon={Trash2} />
              <span className='max-sm:hidden sm:inline text-3xs'>
                {ASYNC_ACTION_LABELS.clear[clearSessionState]}
              </span>
            </Button>
          )}

          {env !== 'production' && (
            <Button
              type='button'
              variant='ghost'
              onClick={handleUnwaitlist}
              disabled={
                unwaitlistState === 'loading' || unwaitlistState === 'done'
              }
              title='Approve your own waitlist entry (dev only)'
              className='h-auto flex items-center gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              aria-label='Unwaitlist'
            >
              <AsyncActionIcon state={unwaitlistState} idleIcon={UserCheck} />
              <span className='max-sm:hidden sm:inline text-3xs'>
                {ASYNC_ACTION_LABELS.unwaitlist[unwaitlistState]}
              </span>
            </Button>
          )}

          {env !== 'production' && (
            <Button
              type='button'
              variant='ghost'
              onClick={handleSyncClerk}
              disabled={
                syncClerkState === 'loading' || syncClerkState === 'done'
              }
              title='Sync Clerk user ID to DB (fixes clerk_id mismatch between dev/prod)'
              className='h-auto flex items-center gap-1 px-1.5 py-1 rounded text-quaternary-token hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              aria-label='Sync Clerk ID'
            >
              {syncClerkState === 'loading' && (
                <Loader2 size={11} className='animate-spin' />
              )}
              {syncClerkState === 'done' && (
                <Check size={11} className='text-accent' />
              )}
              {syncClerkState === 'noop' && (
                <Check size={11} className='text-quaternary-token' />
              )}
              {syncClerkState !== 'loading' &&
                syncClerkState !== 'done' &&
                syncClerkState !== 'noop' && <RefreshCw size={11} />}
              <span className='max-sm:hidden sm:inline text-3xs'>
                {
                  {
                    loading: 'Syncing...',
                    done: 'Synced!',
                    noop: 'In sync',
                    error: 'Failed',
                    idle: 'Sync Clerk',
                  }[syncClerkState]
                }
              </span>
            </Button>
          )}

          {env !== 'production' && (
            <Button
              type='button'
              variant='ghost'
              onClick={async () => {
                const next = !swEnabled;
                setSwEnabled(next);
                localStorage.setItem(SW_ENABLED_KEY, next ? '1' : '0');
                if (next) {
                  await registerServiceWorker();
                } else {
                  await unregisterServiceWorker();
                }
                globalThis.location.reload();
              }}
              {...getSwButtonProps(swEnabled)}
            >
              <Globe size={11} />
              <span className='max-sm:hidden sm:inline text-3xs'>SW</span>
            </Button>
          )}

          {/* Promote to production — preview only */}
          {env === 'preview' &&
            promoteState !== 'idle' &&
            promoteState !== 'checking' && (
              <>
                <div className='w-px h-4 mx-1 bg-subtle' />
                <Button
                  type='button'
                  variant='ghost'
                  onClick={handlePromote}
                  disabled={
                    promoteState === 'promoting' || promoteState === 'done'
                  }
                  title={getPromoteTitle(promoteSha)}
                  className={`h-auto flex items-center gap-1 px-1.5 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getPromoteButtonColor(promoteState)}`}
                  aria-label='Promote To Production'
                >
                  <PromoteIcon state={promoteState} />
                  <span className='max-sm:hidden sm:inline text-3xs'>
                    {PROMOTE_LABELS[promoteState]}
                  </span>
                  {promoteState === 'ready' && promoteSha && (
                    <span className='max-md:hidden md:inline text-3xs opacity-60'>
                      {promoteSha.staging}→{promoteSha.prod}
                    </span>
                  )}
                </Button>
              </>
            )}

          <div className='w-px h-4 mx-1 bg-subtle' />

          {/* Expand/collapse + hide */}
          <Button
            type='button'
            variant='ghost'
            onClick={toggleOpen}
            className='h-auto flex items-center gap-1 px-2 py-1 rounded text-(--color-text-tertiary) hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors'
            aria-label={open ? 'Collapse Dev Toolbar' : 'Expand Dev Toolbar'}
          >
            <ExpandCollapseIcon open={open} />
          </Button>
          <Button
            type='button'
            variant='ghost'
            onClick={hide}
            className='h-auto flex items-center px-2 py-1 rounded text-(--color-text-tertiary) hover:text-(--color-text-primary) hover:bg-surface-2 transition-colors'
            aria-label='Hide Dev Toolbar'
          >
            <X size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Plan toggle gate — only renders inner component when QueryClientProvider exists. */
