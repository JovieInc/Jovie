'use client';

import type { TaskDescriptionHelperPayload } from '@/lib/tasks/task-description-helper';

interface TaskDescriptionHelperProps {
  readonly helper: TaskDescriptionHelperPayload;
  readonly onBeginEditing: () => void;
}

export function TaskDescriptionHelper({
  helper,
  onBeginEditing,
}: TaskDescriptionHelperProps) {
  const introKeyCounts = new Map<string, number>();
  const bulletKeyCounts = new Map<string, number>();
  const linkKeyCounts = new Map<string, number>();

  return (
    <div className='absolute inset-0 min-h-[520px] overflow-hidden rounded-[18px]'>
      <button
        type='button'
        aria-label={`Open ${helper.title} description helper`}
        data-testid='task-description-helper'
        onClick={onBeginEditing}
        className='absolute inset-0 rounded-[18px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-app-shell-border)_4%)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--linear-border-focus)]'
      />
      <div className='pointer-events-none relative z-10 h-full overflow-y-auto px-5 py-5 text-left'>
        <div className='max-w-[40rem] space-y-3'>
          <div className='space-y-1'>
            <h3 className='text-[13px] font-[600] text-primary-token'>
              {helper.title}
            </h3>
            {helper.intro.map(paragraph => {
              const occurrence = introKeyCounts.get(paragraph) ?? 0;
              introKeyCounts.set(paragraph, occurrence + 1);

              return (
                <p
                  key={`intro-${paragraph}-${occurrence}`}
                  className='text-[13px] leading-6 text-secondary-token'
                >
                  {paragraph}
                </p>
              );
            })}
          </div>

          {helper.bullets && helper.bullets.length > 0 ? (
            <ul className='space-y-1.5 pl-4 text-[13px] leading-6 text-secondary-token marker:text-tertiary-token'>
              {helper.bullets.map(bullet => {
                const occurrence = bulletKeyCounts.get(bullet) ?? 0;
                bulletKeyCounts.set(bullet, occurrence + 1);

                return <li key={`bullet-${bullet}-${occurrence}`}>{bullet}</li>;
              })}
            </ul>
          ) : null}

          {helper.links && helper.links.length > 0 ? (
            <ul className='space-y-1.5 text-[12px] leading-5 text-secondary-token'>
              {helper.links.map(link => {
                const linkKey = `${link.href}:${link.label}`;
                const occurrence = linkKeyCounts.get(linkKey) ?? 0;
                linkKeyCounts.set(linkKey, occurrence + 1);

                return (
                  <li key={`link-${linkKey}-${occurrence}`}>
                    <a
                      href={link.href}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='pointer-events-auto text-[var(--linear-accent,#5e6ad2)] hover:underline focus-visible:outline-none focus-visible:underline'
                    >
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {helper.footer ? (
            <p className='text-[12px] leading-5 text-tertiary-token'>
              {helper.footer}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
