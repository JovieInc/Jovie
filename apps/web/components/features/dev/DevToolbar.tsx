'use client';

import * as Switch from '@radix-ui/react-switch';
import {
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Moon,
  RefreshCw,
  Route,
  Search,
  Sun,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import {
  CODE_FLAG_KEYS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS,
  FF_OVERRIDES_KEY,
} from '@/lib/feature-flags/shared';
import {
  registerServiceWorker,
  SW_ENABLED_KEY,
  unregisterServiceWorker,
} from '@/lib/service-worker/control';

function useLocalOverrides() {
  const [overrides, setOverridesState] = useState<Record<string, boolean>>(
    () => {
      if (typeof globalThis.window === 'undefined') return {};
      try {
        return JSON.parse(localStorage.getItem(FF_OVERRIDES_KEY) ?? '{}');
      } catch {
        return {};
      }
    }
  );

  const setOverride = useCallback((key: string, value: boolean) => {
    setOverridesState(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeOverride = useCallback((key: string) => {
    setOverridesState(prev => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setOverridesState({});
    localStorage.removeItem(FF_OVERRIDES_KEY);
  }, []);

  return { overrides, setOverride, removeOverride, clearOverrides };
}

type FlagEntry = {
  name: string;
  key: string;
  source: 'statsig' | 'code';
  serverDefault: boolean;
};

const ALL_FLAGS: FlagEntry[] = [
  ...(Object.entries(FEATURE_FLAG_KEYS) as [string, string][]).map(
    ([name, key]) => ({
      name,
      key,
      source: 'statsig' as const,
      serverDefault: false,
    })
  ),
  ...(Object.entries(CODE_FLAG_KEYS) as [string, string][]).map(
    ([name, key]) => ({
      name,
      key,
      source: 'code' as const,
      serverDefault: FEATURE_FLAGS[name as keyof typeof FEATURE_FLAGS],
    })
  ),
];

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
  const [swEnabled, setSwEnabled] = useState(false);
  const [promoteState, setPromoteState] = useState<
    'idle' | 'checking' | 'ready' | 'promoting' | 'done' | 'error'
  >('idle');
  const [promoteSha, setPromoteSha] = useState<{
    staging: string;
    prod: string;
  } | null>(null);
  const { theme, setTheme } = useTheme();
  const overridesCtx = useLocalOverrides();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const breakpoint = useBreakpoint();

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
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        if (hidden) {
          setHidden(false);
          localStorage.setItem(TOOLBAR_HIDDEN_KEY, '0');
        } else {
          setHidden(true);
          localStorage.setItem(TOOLBAR_HIDDEN_KEY, '1');
        }
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        localStorage.setItem(TOOLBAR_STORAGE_KEY, '0');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hidden, open]);

  // Add bottom padding to body so the toolbar doesn't cover content
  useEffect(() => {
    if (hidden) {
      document.body.style.paddingBottom = '';
      return;
    }
    const updatePadding = () => {
      const h = toolbarRef.current?.offsetHeight ?? 0;
      document.body.style.paddingBottom = h > 0 ? `${h}px` : '';
    };
    updatePadding();
    const timer = setTimeout(updatePadding, 220);
    return () => {
      clearTimeout(timer);
      document.body.style.paddingBottom = '';
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
        setPromoteState(prev =>
          prev === 'promoting' || prev === 'done'
            ? prev
            : data.needsPromote
              ? 'ready'
              : 'idle'
        );
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
  const overrideCount = Object.keys(overrides).length;

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
          setTimeout(() => window.location.reload(), 500);
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
      <button
        type='button'
        onClick={show}
        data-testid='dev-toolbar'
        className='fixed bottom-3 right-3 z-[9999] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface-1)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] shadow-md font-mono text-[10px] transition-colors'
        aria-label='Show dev toolbar'
        title='Show dev toolbar (⌘⇧D)'
      >
        <Wrench size={11} />
        Dev
      </button>
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
        className='overflow-hidden transition-all duration-200 ease-in-out border-t border-[var(--color-border-default)] backdrop-blur-sm bg-[var(--color-bg-surface-1)]/80'
        style={{
          maxHeight: open ? '400px' : '0px',
          borderTopWidth: open ? undefined : 0,
        }}
      >
        <div className='flex flex-col'>
          {/* Search bar */}
          <div className='flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-subtle)]'>
            <Search
              size={12}
              className='shrink-0 text-[var(--color-text-quaternary-token)]'
            />
            <input
              ref={searchRef}
              type='text'
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder='Search flags...'
              className='flex-1 bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-quaternary-token)] outline-none text-xs'
              aria-label='Search flags'
            />
            {search && (
              <button
                type='button'
                onClick={() => setSearch('')}
                className='shrink-0 text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] transition-colors'
                aria-label='Clear search'
              >
                <X size={11} />
              </button>
            )}
            <span className='shrink-0 text-[10px] text-[var(--color-text-quaternary-token)]'>
              {matchCount} of {filteredFlags.total}
            </span>
          </div>

          {/* Flags list */}
          <div className='px-4 py-2 max-h-48 overflow-y-auto'>
            {/* Overridden flags group */}
            {filteredFlags.overridden.length > 0 && (
              <div className='mb-2 border-l-2 border-[var(--color-accent)] pl-3'>
                <div className='flex items-center justify-between mb-1'>
                  <span className='text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]'>
                    Overrides ({filteredFlags.overridden.length})
                  </span>
                  <button
                    type='button'
                    onClick={overridesCtx.clearOverrides}
                    className='text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] underline transition-colors'
                  >
                    clear all
                  </button>
                </div>
                <div className='flex flex-col gap-0.5'>
                  {filteredFlags.overridden.map(flag => (
                    <FlagRow
                      key={flag.key}
                      label={flag.name.toLowerCase().replaceAll('_', ' ')}
                      isOverridden
                      checked={overrides[flag.key]}
                      serverDefault={flag.serverDefault}
                      onCheckedChange={v =>
                        overridesCtx.setOverride(flag.key, v)
                      }
                      onClear={() => overridesCtx.removeOverride(flag.key)}
                      source={flag.source}
                    />
                  ))}
                </div>
              </div>
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
                      isOverridden={false}
                      checked={checked}
                      onCheckedChange={v =>
                        overridesCtx.setOverride(flag.key, v)
                      }
                      onClear={() => overridesCtx.removeOverride(flag.key)}
                      source={flag.source}
                    />
                  );
                })}
              </div>
            )}

            {/* Empty search state */}
            {matchCount === 0 && search && (
              <div className='py-3 text-center text-[var(--color-text-quaternary-token)]'>
                No flags match &lsquo;{search}&rsquo;
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar (always visible) */}
      <div className='relative flex items-center h-9 px-4 gap-2 border-t border-[var(--color-border-default)] backdrop-blur-sm bg-[var(--color-bg-surface-1)]/80 shadow-[0_-2px_8px_rgba(0,0,0,0.1)]'>
        {/* Center: brand logo */}
        <div className='absolute left-1/2 -translate-x-1/2 pointer-events-none'>
          <BrandLogo size={16} tone='auto' aria-hidden rounded={false} />
        </div>
        {/* Left: env + version */}
        <span
          className={`px-2 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${envColor}`}
        >
          {env}
        </span>
        {sha && (
          <span className='hidden sm:inline text-[var(--color-text-quaternary-token)] truncate'>
            {sha}
          </span>
        )}
        {version && (
          <span className='hidden sm:inline text-[var(--color-text-quaternary-token)] shrink-0'>
            v{version}
          </span>
        )}

        {/* Override badge */}
        {overrideCount > 0 && (
          <button
            type='button'
            onClick={() => {
              if (!open) toggleOpen();
            }}
            className='px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/30 shrink-0 hover:bg-[var(--color-accent)]/20 transition-colors cursor-pointer'
            title='View overrides'
          >
            {overrideCount} {overrideCount === 1 ? 'override' : 'overrides'}
          </button>
        )}

        <span className='hidden md:inline px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-quaternary-token)] bg-[var(--color-bg-surface-2)] shrink-0'>
          {breakpoint}
        </span>

        <div className='flex-1' />

        {/* Quick actions */}
        <div className='flex items-center gap-0.5'>
          {/* Theme picker */}
          {[
            { value: 'dark', icon: Moon, label: 'Dark theme' },
            { value: 'light', icon: Sun, label: 'Light theme' },
            { value: 'system', icon: Monitor, label: 'System theme' },
          ].map(({ value, icon: Icon, label }) => (
            <button
              type='button'
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              className={`p-1.5 rounded transition-colors ${
                mounted && theme === value
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)]'
              }`}
              aria-label={label}
            >
              <Icon size={12} />
            </button>
          ))}

          <div className='w-px h-4 mx-1 bg-[var(--color-border-subtle)]' />

          {sha && (
            <button
              type='button'
              onClick={() => copyToClipboard(sha, 'sha')}
              title={`Copy SHA: ${sha}`}
              className='flex items-center gap-1 px-1.5 py-1 rounded text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors'
              aria-label='Copy SHA'
            >
              {copiedField === 'sha' ? (
                <Check size={11} className='text-[var(--color-accent)]' />
              ) : (
                <Copy size={11} />
              )}
              <span className='hidden sm:inline text-[10px]'>SHA</span>
            </button>
          )}

          <button
            type='button'
            onClick={() =>
              copyToClipboard(globalThis.location.pathname, 'route')
            }
            title={`Copy route: ${typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : ''}`}
            className='flex items-center gap-1 px-1.5 py-1 rounded text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors'
            aria-label='Copy route'
          >
            {copiedField === 'route' ? (
              <Check size={11} className='text-[var(--color-accent)]' />
            ) : (
              <Route size={11} />
            )}
            <span className='hidden sm:inline text-[10px]'>Route</span>
          </button>

          <Link
            href={APP_ROUTES.ADMIN}
            title='Open admin panel'
            className='flex items-center gap-1 px-1.5 py-1 rounded text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors'
            aria-label='Admin panel'
          >
            <ExternalLink size={11} />
            <span className='hidden sm:inline text-[10px]'>Admin</span>
          </Link>

          {env !== 'production' && (
            <button
              type='button'
              onClick={handleClearSession}
              disabled={
                clearSessionState === 'loading' || clearSessionState === 'done'
              }
              title='Clear all cookies, localStorage, and sessionStorage'
              className='flex items-center gap-1 px-1.5 py-1 rounded text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              aria-label='Clear session'
            >
              {clearSessionState === 'loading' ? (
                <Loader2 size={11} className='animate-spin' />
              ) : clearSessionState === 'done' ? (
                <Check size={11} className='text-[var(--color-accent)]' />
              ) : (
                <Trash2 size={11} />
              )}
              <span className='hidden sm:inline text-[10px]'>
                {clearSessionState === 'loading'
                  ? 'Clearing...'
                  : clearSessionState === 'done'
                    ? 'Cleared!'
                    : clearSessionState === 'error'
                      ? 'Failed'
                      : 'Clear'}
              </span>
            </button>
          )}

          {env !== 'production' && (
            <button
              type='button'
              onClick={handleUnwaitlist}
              disabled={
                unwaitlistState === 'loading' || unwaitlistState === 'done'
              }
              title='Approve your own waitlist entry (dev only)'
              className='flex items-center gap-1 px-1.5 py-1 rounded text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              aria-label='Unwaitlist'
            >
              {unwaitlistState === 'loading' ? (
                <Loader2 size={11} className='animate-spin' />
              ) : unwaitlistState === 'done' ? (
                <Check size={11} className='text-[var(--color-accent)]' />
              ) : (
                <UserCheck size={11} />
              )}
              <span className='hidden sm:inline text-[10px]'>
                {unwaitlistState === 'loading'
                  ? 'Working...'
                  : unwaitlistState === 'done'
                    ? 'Done!'
                    : unwaitlistState === 'error'
                      ? 'Failed'
                      : 'Unwaitlist'}
              </span>
            </button>
          )}

          {env !== 'production' && (
            <button
              type='button'
              onClick={handleSyncClerk}
              disabled={
                syncClerkState === 'loading' || syncClerkState === 'done'
              }
              title='Sync Clerk user ID to DB (fixes clerk_id mismatch between dev/prod)'
              className='flex items-center gap-1 px-1.5 py-1 rounded text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              aria-label='Sync Clerk ID'
            >
              {syncClerkState === 'loading' ? (
                <Loader2 size={11} className='animate-spin' />
              ) : syncClerkState === 'done' ? (
                <Check size={11} className='text-[var(--color-accent)]' />
              ) : syncClerkState === 'noop' ? (
                <Check
                  size={11}
                  className='text-[var(--color-text-quaternary-token)]'
                />
              ) : (
                <RefreshCw size={11} />
              )}
              <span className='hidden sm:inline text-[10px]'>
                {syncClerkState === 'loading'
                  ? 'Syncing...'
                  : syncClerkState === 'done'
                    ? 'Synced!'
                    : syncClerkState === 'noop'
                      ? 'In sync'
                      : syncClerkState === 'error'
                        ? 'Failed'
                        : 'Sync Clerk'}
              </span>
            </button>
          )}

          {env !== 'production' && (
            <button
              type='button'
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
              title={
                swEnabled
                  ? 'Service worker active — click to disable'
                  : 'Service worker disabled — click to enable'
              }
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
                swEnabled
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)]'
              }`}
              aria-label={
                swEnabled ? 'Disable service worker' : 'Enable service worker'
              }
            >
              <Globe size={11} />
              <span className='hidden sm:inline text-[10px]'>SW</span>
            </button>
          )}

          {/* Promote to production — preview only */}
          {env === 'preview' &&
            promoteState !== 'idle' &&
            promoteState !== 'checking' && (
              <>
                <div className='w-px h-4 mx-1 bg-[var(--color-border-subtle)]' />
                <button
                  type='button'
                  onClick={handlePromote}
                  disabled={
                    promoteState === 'promoting' || promoteState === 'done'
                  }
                  title={
                    promoteSha
                      ? `Promote ${promoteSha.staging} → prod (currently ${promoteSha.prod})`
                      : 'Promote to production'
                  }
                  className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    promoteState === 'done'
                      ? 'text-[var(--color-accent)]'
                      : promoteState === 'error'
                        ? 'text-red-400'
                        : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                  }`}
                  aria-label='Promote to production'
                >
                  {promoteState === 'promoting' ? (
                    <Loader2 size={11} className='animate-spin' />
                  ) : promoteState === 'done' ? (
                    <Check size={11} />
                  ) : (
                    <ArrowUpCircle size={11} />
                  )}
                  <span className='hidden sm:inline text-[10px]'>
                    {promoteState === 'promoting'
                      ? 'Deploying...'
                      : promoteState === 'done'
                        ? 'Deployed!'
                        : promoteState === 'error'
                          ? 'Failed'
                          : 'Promote'}
                  </span>
                  {promoteState === 'ready' && promoteSha && (
                    <span className='hidden md:inline text-[9px] opacity-60'>
                      {promoteSha.staging}→{promoteSha.prod}
                    </span>
                  )}
                </button>
              </>
            )}

          <div className='w-px h-4 mx-1 bg-[var(--color-border-subtle)]' />

          {/* Expand/collapse + hide */}
          <button
            type='button'
            onClick={toggleOpen}
            className='flex items-center gap-1 px-2 py-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors'
            aria-label={open ? 'Collapse dev toolbar' : 'Expand dev toolbar'}
          >
            {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          <button
            type='button'
            onClick={hide}
            className='flex items-center px-2 py-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors'
            aria-label='Hide dev toolbar'
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FlagRow({
  label,
  isOverridden,
  checked,
  serverDefault,
  onCheckedChange,
  onClear,
  source = 'statsig',
}: Readonly<{
  label: string;
  isOverridden: boolean;
  checked: boolean;
  serverDefault?: boolean;
  onCheckedChange: (v: boolean) => void;
  onClear: () => void;
  source?: 'statsig' | 'code';
}>) {
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const handleChange = (v: boolean) => {
    onCheckedChange(v);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 400);
  };

  return (
    <div
      className={`flex items-center gap-2 py-0.5 rounded-sm transition-colors duration-300 ${
        flash ? 'bg-[var(--color-accent)]/10' : ''
      }`}
    >
      <Switch.Root
        checked={checked}
        onCheckedChange={handleChange}
        className={`relative w-7 h-4 rounded-full transition-colors outline-none cursor-pointer shrink-0 ${
          checked
            ? 'bg-[var(--color-accent)]'
            : 'bg-[var(--color-bg-surface-3)]'
        }`}
      >
        <Switch.Thumb className='block w-3 h-3 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-3.5 shadow-sm' />
      </Switch.Root>
      <span
        className={`flex-1 truncate ${isOverridden ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
      >
        {label}
      </span>
      {isOverridden && serverDefault !== undefined && (
        <span className='shrink-0 text-[9px] text-[var(--color-text-quaternary-token)]'>
          server: {serverDefault ? 'on' : 'off'}
        </span>
      )}
      {isOverridden && (
        <button
          type='button'
          onClick={onClear}
          title='Remove override'
          className='shrink-0 text-[var(--color-text-quaternary-token)] hover:text-[var(--color-text-secondary)] transition-colors'
        >
          <X size={10} />
        </button>
      )}
      {!isOverridden && (
        <span className='shrink-0 text-[9px] text-[var(--color-text-quaternary-token)]'>
          {source}
        </span>
      )}
    </div>
  );
}
