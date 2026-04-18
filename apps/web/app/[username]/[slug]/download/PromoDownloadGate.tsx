'use client';

/**
 * PromoDownloadGate — email-gated download UI for DJ promos.
 *
 * Three states: email input → OTP input → download ready.
 * Fits within the 272px SmartLinkPageFrame column.
 * Reuses OtpInput component for 6-digit verification.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { OtpInput } from '@/features/auth/atoms/otp-input';

const STORAGE_KEY = 'jv_promo_email';

interface PromoFile {
  id: string;
  title: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number | null;
}

interface DownloadFile extends PromoFile {
  downloadUrl: string;
}

interface PromoDownloadGateProps {
  readonly releaseId: string;
  readonly creatorProfileId: string;
  readonly files: PromoFile[];
}

type GateState = 'email' | 'otp' | 'ready';

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'MP3',
    'audio/wav': 'WAV',
    'audio/flac': 'FLAC',
    'audio/aiff': 'AIFF',
    'audio/mp4': 'M4A',
    'audio/x-m4a': 'M4A',
  };
  return map[mimeType] ?? '???';
}

export function PromoDownloadGate({
  releaseId,
  creatorProfileId,
  files,
}: Readonly<PromoDownloadGateProps>) {
  const [state, setState] = useState<GateState>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadFiles, setDownloadFiles] = useState<DownloadFile[]>([]);
  const [resendCountdown, setResendCountdown] = useState(0);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill email from localStorage (cross-artist)
  useEffect(() => {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved) setEmail(saved);
  }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const requestOtp = useCallback(
    async (emailToUse: string) => {
      setLoading(true);
      setError(null);

      try {
        // Use first file ID as the gate entry point
        const res = await fetch(
          `/api/promo-downloads/${files[0].id}/request-otp`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailToUse }),
          }
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? 'Failed to send code');
          return;
        }

        setState('otp');
        setResendCountdown(30);
      } catch {
        setError('Something went wrong. Try again.');
      } finally {
        setLoading(false);
      }
    },
    [files]
  );

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;
      await requestOtp(email.trim());
    },
    [email, requestOtp]
  );

  const handleResend = useCallback(async () => {
    if (resendCountdown > 0) return;
    await requestOtp(email.trim());
  }, [email, resendCountdown, requestOtp]);

  const handleOtpComplete = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/promo-downloads/${files[0].id}/verify-otp`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), code }),
          }
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? 'Verification failed');
          setOtpCode('');
          return;
        }

        // Save email for cross-artist pre-fill
        globalThis.localStorage?.setItem(STORAGE_KEY, email.trim());

        setDownloadFiles(
          data.files.map((f: DownloadFile) => ({
            id: f.id,
            title: f.title,
            fileName: f.fileName,
            fileMimeType: f.fileMimeType,
            fileSizeBytes: f.fileSizeBytes,
            downloadUrl: f.downloadUrl,
          }))
        );
        setState('ready');
      } catch {
        setError('Verification failed. Try again.');
        setOtpCode('');
      } finally {
        setLoading(false);
      }
    },
    [email, files]
  );

  return (
    <div className='space-y-3'>
      {/* File list — always visible */}
      <div className='space-y-1.5'>
        {(state === 'ready' ? downloadFiles : files).map(file => (
          <div
            key={file.id}
            className='flex items-center justify-between rounded-lg bg-surface-1/40 px-3 py-2 ring-1 ring-inset ring-white/[0.08]'
          >
            <div className='min-w-0 flex-1'>
              <p className='text-foreground truncate text-xs font-medium'>
                {file.title}
              </p>
              <p className='text-muted-foreground text-2xs'>
                {formatExtension(file.fileMimeType)}
                {file.fileSizeBytes
                  ? ` · ${formatFileSize(file.fileSizeBytes)}`
                  : ''}
              </p>
            </div>
            {state === 'ready' && 'downloadUrl' in file && (
              <a
                href={(file as DownloadFile).downloadUrl}
                download={file.fileName}
                aria-label={`Download ${file.title}`}
                className='ml-2 shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-2xs font-semibold text-white transition-colors hover:bg-white/20'
              >
                <Icon
                  name='Download'
                  className='inline-block h-3 w-3'
                  aria-hidden='true'
                />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Gate form */}
      {state === 'email' && (
        <form onSubmit={handleEmailSubmit} className='space-y-2'>
          <p className='text-muted-foreground text-center text-xs'>
            Enter your email to download
          </p>
          <label htmlFor='promo-download-email' className='sr-only'>
            Email address
          </label>
          <input
            id='promo-download-email'
            ref={emailInputRef}
            type='email'
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder='your@email.com'
            required
            autoComplete='email'
            className='text-foreground placeholder:text-muted-foreground/50 w-full rounded-lg border-0 bg-surface-1/50 px-3 py-2.5 text-sm ring-1 ring-inset ring-white/[0.12] focus:ring-white/30 focus:outline-none'
          />
          {/* Honeypot — hidden from humans, bots fill it */}
          <input
            type='text'
            name='website'
            tabIndex={-1}
            autoComplete='off'
            className='absolute -left-[9999px] opacity-0'
            aria-hidden='true'
          />
          <button
            type='submit'
            disabled={loading || !email.trim()}
            className='w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-opacity disabled:opacity-50'
          >
            {loading ? 'Sending...' : 'Get Download'}
          </button>
        </form>
      )}

      {state === 'otp' && (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-center text-xs'>
            Check your inbox. Enter your code.
          </p>
          <OtpInput
            value={otpCode}
            onChange={setOtpCode}
            onComplete={handleOtpComplete}
            error={!!error}
            disabled={loading}
          />
          <button
            type='button'
            onClick={handleResend}
            disabled={resendCountdown > 0}
            className='text-muted-foreground hover:text-foreground w-full text-center text-2xs transition-colors disabled:opacity-50'
          >
            {resendCountdown > 0
              ? `Resend code in ${resendCountdown}s`
              : 'Resend code'}
          </button>
        </div>
      )}

      {state === 'ready' && (
        <p className='text-muted-foreground text-center text-2xs'>
          Download links also sent to your email.
        </p>
      )}

      {/* Error display */}
      {error && (
        <p className='text-center text-xs text-red-400' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}
