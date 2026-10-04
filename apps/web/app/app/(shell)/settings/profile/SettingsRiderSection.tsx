'use client';

import { Button, Input, Label, NativeSelect, Textarea } from '@jovie/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { renderRiderHtml, renderRiderMarkdown } from '@/lib/rider/render';
import type { RiderSection, RiderVisibility } from '@/lib/rider/types';

interface EditableSection {
  id: string;
  title: string;
  itemsText: string;
}

interface RiderMeta {
  version: number;
  hasPassword: boolean;
  shareUrl: string | null;
}

const newSection = (title = '', itemsText = ''): EditableSection => ({
  id: crypto.randomUUID(),
  title,
  itemsText,
});

const toEditable = (sections: readonly RiderSection[]): EditableSection[] =>
  sections.map(s => newSection(s.title, s.items.join('\n')));

const toSections = (editable: readonly EditableSection[]): RiderSection[] =>
  editable
    .map(s => ({
      title: s.title.trim(),
      items: s.itemsText
        .split('\n')
        .map(i => i.trim())
        .filter(Boolean),
    }))
    .filter(s => s.title.length > 0);

function SectionListEditor({
  label,
  sections,
  onChange,
}: {
  readonly label: string;
  readonly sections: EditableSection[];
  readonly onChange: (next: EditableSection[]) => void;
}) {
  const update = (index: number, patch: Partial<EditableSection>) =>
    onChange(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <fieldset className='space-y-3'>
      <legend className='text-sm font-caption text-primary-token'>
        {label}
      </legend>
      {sections.map((section, index) => (
        <div
          key={section.id}
          className='space-y-2 rounded-lg border border-subtle p-3'
        >
          <div className='flex items-center gap-2'>
            <Input
              value={section.title}
              onChange={e => update(index, { title: e.target.value })}
              placeholder='Section title'
              aria-label={`${label} section ${index + 1} title`}
            />
            <Button
              variant='ghost'
              size='sm'
              aria-label={`Remove ${label} section ${index + 1}`}
              onClick={() => onChange(sections.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
          <Textarea
            value={section.itemsText}
            onChange={e => update(index, { itemsText: e.target.value })}
            placeholder='One item per line'
            rows={4}
            aria-label={`${label} section ${index + 1} items`}
          />
        </div>
      ))}
      <Button
        variant='secondary'
        size='sm'
        onClick={() => onChange([...sections, newSection()])}
      >
        Add Section
      </Button>
    </fieldset>
  );
}

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private — Only You And Your Team' },
  { value: 'profile_public', label: 'Public — Visible On Your Profile' },
  { value: 'link_only', label: 'Link Only — Anyone With The Signed Link' },
];

export function SettingsRiderSection({
  profileId,
  username,
}: {
  readonly profileId: string;
  readonly username: string;
}) {
  const [meta, setMeta] = useState<RiderMeta | null>(null);
  const [technical, setTechnical] = useState<EditableSection[]>([]);
  const [hospitality, setHospitality] = useState<EditableSection[]>([]);
  const [visibility, setVisibility] = useState<RiderVisibility>('private');
  const [passwordInput, setPasswordInput] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/dashboard/rider?profileId=${encodeURIComponent(profileId)}`
    );
    if (!res.ok) {
      setMeta(null);
      return;
    }
    const data = (await res.json()) as {
      rider: {
        technical: RiderSection[];
        hospitality: RiderSection[];
        visibility: RiderVisibility;
        hasPassword: boolean;
      };
      version: number;
      shareUrl: string | null;
    };
    setTechnical(toEditable(data.rider.technical));
    setHospitality(toEditable(data.rider.hospitality));
    setVisibility(data.rider.visibility);
    setMeta({
      version: data.version,
      hasPassword: data.rider.hasPassword,
      shareUrl: data.shareUrl,
    });
    setPasswordInput('');
    setClearPassword(false);
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewHtml = useMemo(
    () =>
      renderRiderHtml({
        artistName: username,
        technical: toSections(technical),
        hospitality: toSections(hospitality),
      }),
    [username, technical, hospitality]
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/dashboard/rider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          expectedVersion: meta?.version ?? 0,
          rider: {
            technical: toSections(technical),
            hospitality: toSections(hospitality),
            visibility,
            password: clearPassword ? null : passwordInput || undefined,
          },
        }),
      });
      if (res.status === 409) {
        toast.error('This rider was updated elsewhere. Reloaded latest.');
        await load();
        return;
      }
      if (!res.ok) {
        toast.error('Could not save rider');
        return;
      }
      toast.success('Rider saved');
      await load();
    } finally {
      setIsSaving(false);
    }
  };

  const copyShareUrl = () =>
    navigator.clipboard
      .writeText(meta?.shareUrl ?? '')
      .then(() => toast.success('Share link copied'))
      .catch(() => toast.error('Could not copy. Please copy manually.'));

  const handleExport = (format: 'markdown' | 'html') => {
    const isMarkdown = format === 'markdown';
    const body = isMarkdown
      ? renderRiderMarkdown({
          artistName: username,
          technical: toSections(technical),
          hospitality: toSections(hospitality),
        })
      : previewHtml;
    const url = URL.createObjectURL(
      new Blob([body], {
        type: isMarkdown ? 'text/markdown' : 'text/html',
      })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}-rider.${isMarkdown ? 'md' : 'html'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SettingsPanel
      title='Rider'
      description='Technical and hospitality rider for venues and promoters. Private by default.'
      bodyClassName='space-y-4 px-4 py-4 sm:px-5'
    >
      {meta === null ? (
        <p className='text-app text-secondary-token'>Loading rider…</p>
      ) : (
        <>
          <NativeSelect
            label='Visibility'
            value={visibility}
            onChange={e => setVisibility(e.target.value as RiderVisibility)}
            options={VISIBILITY_OPTIONS}
          />

          {visibility === 'link_only' && meta.shareUrl ? (
            <Button variant='secondary' size='sm' onClick={copyShareUrl}>
              Copy Share Link
            </Button>
          ) : null}

          <SectionListEditor
            label='Technical Rider'
            sections={technical}
            onChange={setTechnical}
          />
          <SectionListEditor
            label='Hospitality Rider'
            sections={hospitality}
            onChange={setHospitality}
          />

          <div className='space-y-2'>
            <Label htmlFor='rider-password'>
              Rider Password {meta.hasPassword ? '(Set)' : '(Optional)'}
            </Label>
            <Input
              id='rider-password'
              type='password'
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder={
                meta.hasPassword ? 'Enter a new password to change' : 'Optional'
              }
              autoComplete='new-password'
            />
            {meta.hasPassword ? (
              <label className='flex items-center gap-2 text-app text-secondary-token'>
                <input
                  type='checkbox'
                  checked={clearPassword}
                  onChange={e => setClearPassword(e.target.checked)}
                />
                Remove password protection
              </label>
            ) : null}
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleSave} disabled={isSaving} size='sm'>
              {isSaving ? 'Saving…' : 'Save Rider'}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => setShowPreview(c => !c)}
            >
              {showPreview ? 'Hide Preview' : 'Preview'}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => handleExport('markdown')}
            >
              Markdown
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => handleExport('html')}
            >
              HTML
            </Button>
          </div>

          {showPreview ? (
            <iframe
              title='Rider preview'
              sandbox=''
              srcDoc={previewHtml}
              className='h-96 w-full rounded-lg border border-subtle bg-base'
            />
          ) : null}
        </>
      )}
    </SettingsPanel>
  );
}
