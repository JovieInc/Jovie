'use client';

import * as Switch from '@radix-ui/react-switch';
import { ChevronDown, ChevronUp, Monitor, Moon, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useFeatureFlagOverrides } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS, FEATURE_FLAGS } from '@/lib/feature-flags/shared';

const STATSIG_FLAGS = Object.entries(FEATURE_FLAG_KEYS) as [string, string][];
const CODE_FLAGS = Object.entries(FEATURE_FLAGS) as [string, boolean][];

const TOOLBAR_STORAGE_KEY = '__dev_toolbar_open';

export function DevToolbar({
  env,
  sha,
  version,
}: {
  env: string;
  sha: string;
  version: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const overridesCtx = useFeatureFlagOverrides();

  // Restore open state from localStorage and mark as mounted
  useEffect(() => {
    setMounted(true);
    setOpen(localStorage.getItem(TOOLBAR_STORAGE_KEY) === '1');
  }, []);

  function toggleOpen() {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(TOOLBAR_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const envColor =
    env === 'production'
      ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : env === 'preview'
        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        : 'bg-green-500/20 text-green-400 border-green-500/30';

  return (
    <div className='fixed bottom-0 left-0 right-0 z-[9999] font-mono text-xs'>
      {/* Expanded panel */}
      <div
        className='overflow-hidden transition-all duration-200 ease-in-out border-t border-[var(--color-border-default)] bg-[var(--color-bg-surface-1)]'
        style={{
          maxHeight: open ? '300px' : '0px',
          borderTopWidth: open ? undefined : 0,
        }}
      >
        <div className='flex flex-col md:flex-row'>
          {/* Theme section */}
          <Section label='Theme'>
            <div className='flex gap-1'>
              {[
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'system', icon: Monitor, label: 'System' },
              ].map(({ value, icon: Icon, label }) => (
                <button
                  type='button'
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors flex-1 justify-center ${
                    mounted && theme === value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]'
                  }`}
                >
                  <Icon size={11} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Statsig flags */}
          {overridesCtx && (
            <Section
              label='Feature Flags'
              action={
                Object.keys(overridesCtx.overrides).length > 0 ? (
                  <button
                    type='button'
                    onClick={overridesCtx.clearOverrides}
                    className='text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] underline'
                  >
                    clear all
                  </button>
                ) : null
              }
            >
              <div className='flex flex-col gap-1 max-h-32 overflow-y-auto'>
                {STATSIG_FLAGS.map(([name, key]) => {
                  const isOverridden = key in overridesCtx.overrides;
                  const value = overridesCtx.overrides[key] ?? false;
                  return (
                    <FlagRow
                      key={key}
                      label={name.toLowerCase().replace(/_/g, ' ')}
                      isOverridden={isOverridden}
                      checked={value}
                      onCheckedChange={checked =>
                        overridesCtx.setOverride(key, checked)
                      }
                      onClear={() => overridesCtx.removeOverride(key)}
                    />
                  );
                })}
              </div>
            </Section>
          )}

          {/* Code-level flags (read-only) */}
          <Section label='Code Flags' subtitle='Edit source to change'>
            <div className='flex flex-col gap-1 max-h-32 overflow-y-auto'>
              {CODE_FLAGS.map(([name, value]) => (
                <div
                  key={name}
                  className='flex items-center justify-between py-0.5'
                >
                  <span className='text-[var(--color-text-tertiary)] truncate flex-1 mr-2'>
                    {name.toLowerCase().replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      value
                        ? 'text-green-400 bg-green-500/10'
                        : 'text-[var(--color-text-quaternary-token)] bg-[var(--color-bg-surface-2)]'
                    }`}
                  >
                    {value ? 'on' : 'off'}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Bottom bar (always visible) */}
      <div className='flex items-center h-9 px-4 border-t border-[var(--color-border-default)] bg-[var(--color-bg-surface-1)] shadow-[0_-2px_8px_rgba(0,0,0,0.1)]'>
        {/* Left: env info */}
        <div className='flex items-center gap-2 flex-1 min-w-0'>
          <span
            className={`px-2 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${envColor}`}
          >
            {env}
          </span>
          {sha && (
            <span className='text-[var(--color-text-quaternary-token)] truncate'>
              {sha}
            </span>
          )}
          {version && (
            <span className='text-[var(--color-text-quaternary-token)] shrink-0'>
              v{version}
            </span>
          )}
        </div>

        {/* Center: label */}
        <span className='text-[10px] font-semibold tracking-wide uppercase text-[var(--color-text-quaternary-token)] shrink-0'>
          Dev Toolbar
        </span>

        {/* Right: expand/collapse */}
        <div className='flex items-center justify-end flex-1'>
          <button
            type='button'
            onClick={toggleOpen}
            className='flex items-center gap-1 px-2 py-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-2)] transition-colors'
            aria-label={open ? 'Collapse dev toolbar' : 'Expand dev toolbar'}
          >
            {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  subtitle,
  action,
  children,
}: {
  label: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='px-4 py-2.5 border-b md:border-b-0 md:border-r border-[var(--color-border-subtle)] last:border-b-0 last:border-r-0 flex-1 min-w-0'>
      <div className='flex items-center justify-between mb-2'>
        <div>
          <span className='text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]'>
            {label}
          </span>
          {subtitle && (
            <span className='ml-1.5 text-[10px] text-[var(--color-text-quaternary-token)]'>
              ({subtitle})
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function FlagRow({
  label,
  isOverridden,
  checked,
  onCheckedChange,
  onClear,
}: {
  label: string;
  isOverridden: boolean;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div className='flex items-center gap-2 py-0.5'>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={`relative w-7 h-4 rounded-full transition-colors outline-none cursor-pointer shrink-0 ${
          checked
            ? 'bg-[var(--color-accent)]'
            : 'bg-[var(--color-bg-surface-3,#333)]'
        }`}
      >
        <Switch.Thumb className='block w-3 h-3 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-3.5 shadow-sm' />
      </Switch.Root>
      <span
        className={`flex-1 truncate ${isOverridden ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
      >
        {label}
      </span>
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
          statsig
        </span>
      )}
    </div>
  );
}
