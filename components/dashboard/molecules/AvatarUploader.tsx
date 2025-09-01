'use client';

import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';

// flags import removed - pre-launch

interface UploadResult {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
}

interface AvatarUploaderProps {
  onUploaded?: (res: UploadResult) => void;
  folder?: string;
  className?: string;
}

export default function AvatarUploader({
  onUploaded,
  folder,
  className,
}: AvatarUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const disabled = useMemo(() => true, []); // Cloudinary disabled by default

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }, []);

  const onUpload = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      // Get signed upload params from our API
      const signRes = await fetch('/api/images/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      if (!signRes.ok) throw new Error('Failed to sign upload');
      const { cloudName, apiKey, timestamp, signature, upload_preset } =
        (await signRes.json()) as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          upload_preset?: string;
        };

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', apiKey);
      form.append('timestamp', String(timestamp));
      if (upload_preset) form.append('upload_preset', upload_preset);
      if (folder) form.append('folder', folder);
      form.append('signature', signature);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
      const up = await fetch(uploadUrl, { method: 'POST', body: form });
      if (!up.ok) throw new Error('Upload failed');
      const json = (await up.json()) as {
        public_id: string;
        secure_url: string;
        width?: number;
        height?: number;
      };

      onUploaded?.({
        public_id: json.public_id,
        secure_url: json.secure_url,
        width: json.width,
        height: json.height,
      });
    } catch (err) {
      console.error('Avatar upload error', err);
    } finally {
      setLoading(false);
    }
  }, [file, folder, onUploaded]);

  if (disabled) {
    return (
      <div className={className}>
        <p className='text-sm text-neutral-500'>
          Avatar uploads are currently disabled.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className='flex items-center gap-4'>
        {preview ? (
          <Image
            src={preview}
            alt='Preview'
            width={80}
            height={80}
            className='rounded-full object-cover'
          />
        ) : (
          <div className='w-20 h-20 rounded-full bg-neutral-200 dark:bg-neutral-800' />
        )}
        <div className='flex flex-col gap-2'>
          <input
            type='file'
            accept='image/*'
            onChange={onSelect}
            className='block text-sm cursor-pointer'
            aria-label='Choose profile image'
          />
          <button
            type='button'
            onClick={onUpload}
            disabled={!file || loading}
            className='px-3 py-1.5 rounded bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black'
          >
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
