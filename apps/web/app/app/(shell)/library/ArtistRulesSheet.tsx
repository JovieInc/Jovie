'use client';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from '@jovie/ui';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { toast } from '@/components/feedback';
import type {
  ArtistRuleStrength,
  ArtistRuleView,
} from '@/lib/artist-rules/types';

const CATEGORIES = [
  { value: 'visual', label: 'Visual Identity' },
  { value: 'voice', label: 'Voice And Copy' },
  { value: 'commercial', label: 'Sponsors And Brands' },
  { value: 'safety', label: 'Safety' },
  { value: 'workflow', label: 'Workflow' },
] as const;

function ruleStatusLabel(rule: ArtistRuleView): string {
  if (rule.status === 'suggested') return 'Needs confirmation';
  if (rule.status === 'active')
    return rule.strength === 'hard_constraint' ? 'Hard rule' : 'Preference';
  return rule.status === 'superseded' ? 'Superseded' : 'Revoked';
}

type RuleAction =
  | {
      readonly action: 'activate';
      readonly label: 'Confirm Rule';
      readonly variant: 'secondary';
    }
  | {
      readonly action: 'revoke';
      readonly label: 'Revoke';
      readonly variant: 'ghost';
    };

function ruleAction(rule: ArtistRuleView): RuleAction | null {
  if (rule.status === 'suggested') {
    return { action: 'activate', label: 'Confirm Rule', variant: 'secondary' };
  }
  if (rule.status === 'active') {
    return { action: 'revoke', label: 'Revoke', variant: 'ghost' };
  }
  return null;
}

export function ArtistRulesSheet({
  creatorProfileId,
  initialRules,
}: {
  readonly creatorProfileId: string;
  readonly initialRules: readonly ArtistRuleView[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]['value']>('visual');
  const [ruleKey, setRuleKey] = useState('');
  const [instruction, setInstruction] = useState('');
  const [strength, setStrength] =
    useState<ArtistRuleStrength>('hard_constraint');
  const [allowOverride, setAllowOverride] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const submitRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startSaving(async () => {
      try {
        const response = await fetch('/api/artist-rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            creatorProfileId,
            category,
            ruleKey,
            instruction,
            strength,
            allowOverride,
          }),
        });
        const result = (await response.json()) as {
          rule?: ArtistRuleView;
          error?: string;
        };
        if (!response.ok || !result.rule) {
          throw new Error(result.error ?? 'Rule could not be saved');
        }
        setRules(current => [
          result.rule as ArtistRuleView,
          ...current.map(rule =>
            rule.status === 'active' &&
            rule.category === result.rule?.category &&
            rule.ruleKey === result.rule.ruleKey
              ? { ...rule, status: 'superseded' as const }
              : rule
          ),
        ]);
        setRuleKey('');
        setInstruction('');
        toast.success('Artist rule saved');
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Rule could not be saved'
        );
      }
    });
  };

  const updateRule = (rule: ArtistRuleView, action: 'activate' | 'revoke') => {
    startSaving(async () => {
      try {
        const response = await fetch('/api/artist-rules', {
          method: action === 'activate' ? 'PATCH' : 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            creatorProfileId,
            ruleId: rule.id,
            ...(action === 'activate' ? { action } : {}),
          }),
        });
        const result = (await response.json()) as {
          rule?: ArtistRuleView;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error ?? 'Rule could not be updated');
        }
        setRules(current =>
          current.map(item =>
            item.id === rule.id
              ? (result.rule ?? { ...item, status: 'revoked' as const })
              : item
          )
        );
        toast.success(
          action === 'activate' ? 'Rule confirmed' : 'Rule revoked'
        );
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Rule could not be updated'
        );
      }
    });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={creatorProfileId === 'unavailable'}
        >
          <ShieldCheck className='h-3.5 w-3.5' aria-hidden='true' />
          Artist Rules
        </Button>
      </SheetTrigger>
      <SheetContent side='right' className='flex w-full flex-col sm:max-w-md'>
        <SheetHeader className='shrink-0 border-b border-subtle px-5 py-4 text-left'>
          <SheetTitle>Artist Rules</SheetTitle>
          <SheetDescription>
            Confirmed rules guide every draft. Memory can suggest a rule, but it
            cannot activate one.
          </SheetDescription>
        </SheetHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto p-5'>
          <form className='space-y-3' onSubmit={submitRule}>
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1 text-xs text-secondary-token'>
                <label htmlFor='artist-rule-category'>Area</label>
                <Select
                  value={category}
                  onValueChange={value => setCategory(value as typeof category)}
                >
                  <SelectTrigger
                    id='artist-rule-category'
                    className='h-9 w-full'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1 text-xs text-secondary-token'>
                <label htmlFor='artist-rule-key'>Rule label</label>
                <Input
                  id='artist-rule-key'
                  value={ruleKey}
                  onChange={event => setRuleKey(event.target.value)}
                  placeholder='Palette, casing, sponsors'
                  maxLength={80}
                  required
                  className='h-9'
                />
              </div>
            </div>
            <div className='space-y-1 text-xs text-secondary-token'>
              <label htmlFor='artist-rule-instruction'>Instruction</label>
              <Textarea
                id='artist-rule-instruction'
                value={instruction}
                onChange={event => setInstruction(event.target.value)}
                placeholder='Never use yellow; make blue primary'
                maxLength={500}
                required
                className='min-h-20 resize-y'
              />
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1 text-xs text-secondary-token'>
                <label htmlFor='artist-rule-strength'>Strength</label>
                <Select
                  value={strength}
                  onValueChange={value =>
                    setStrength(value as ArtistRuleStrength)
                  }
                >
                  <SelectTrigger
                    id='artist-rule-strength'
                    className='h-9 w-full'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='hard_constraint'>Hard rule</SelectItem>
                    <SelectItem value='preference'>Preference</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className='flex items-end gap-2 pb-2 text-xs text-secondary-token'>
                <input
                  type='checkbox'
                  checked={strength === 'preference' || allowOverride}
                  disabled={strength === 'preference'}
                  onChange={event => setAllowOverride(event.target.checked)}
                  className='h-4 w-4 rounded border-subtle'
                />
                <span>May be overridden</span>
              </label>
            </div>
            <Button type='submit' size='sm' disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Add Rule'}
            </Button>
          </form>

          <section aria-label='Current Artist Rules' className='space-y-2'>
            <h3 className='text-xs font-medium uppercase tracking-wide text-tertiary-token'>
              Current Rules
            </h3>
            {rules.length === 0 ? (
              <p className='rounded-md border border-subtle p-3 text-sm text-secondary-token'>
                No rules yet. Add the first invariant above.
              </p>
            ) : (
              rules.map(rule => {
                const action = ruleAction(rule);
                return (
                  <article
                    key={rule.id}
                    className='space-y-2 rounded-md border border-subtle bg-surface-0 p-3'
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <span className='truncate text-xs font-medium text-primary-token'>
                        {rule.category} · {rule.ruleKey}
                      </span>
                      <span className='shrink-0 text-2xs text-tertiary-token'>
                        {ruleStatusLabel(rule)}
                      </span>
                    </div>
                    <p className='text-sm leading-5 text-secondary-token'>
                      {rule.instruction}
                    </p>
                    <p className='text-2xs text-tertiary-token'>
                      {rule.allowOverride
                        ? 'Overrides require evidence'
                        : 'Cannot be overridden'}
                      {' · '}
                      {rule.provenanceSource === 'memory'
                        ? 'Suggested from memory'
                        : 'Confirmed by artist'}
                    </p>
                    {action ? (
                      <Button
                        type='button'
                        size='sm'
                        variant={action.variant}
                        disabled={isSaving}
                        onClick={() => updateRule(rule, action.action)}
                      >
                        {action.label}
                      </Button>
                    ) : null}
                  </article>
                );
              })
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
