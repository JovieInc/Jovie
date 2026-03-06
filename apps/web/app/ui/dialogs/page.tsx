'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@jovie/ui';
import React from 'react';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2
        className='mb-4 text-[11px] font-semibold uppercase tracking-wider'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        {title}
      </h2>
      <div className='flex flex-wrap items-start gap-6'>{children}</div>
    </div>
  );
}

function Stack({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <span
        className='text-[11px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

export default function DialogsPage() {
  return (
    <div>
      <h1
        className='mb-1 text-lg font-semibold'
        style={{ color: 'var(--linear-text-primary)' }}
      >
        Dialog
      </h1>
      <p
        className='mb-8 text-[13px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        Matches Linear.app — semi-transparent overlay, elevated surface, 8px
        radius, Linear typography
      </p>

      {/* Basic */}
      <Section title='Basic'>
        <Stack title='standard dialog'>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='secondary'>Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog Title</DialogTitle>
                <DialogDescription>
                  This is a standard dialog with a title, description, and
                  footer actions.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant='ghost'>Cancel</Button>
                <Button variant='primary'>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
        <Stack title='without close button'>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='secondary'>Open Dialog</Button>
            </DialogTrigger>
            <DialogContent hideClose>
              <DialogHeader>
                <DialogTitle>No Close Button</DialogTitle>
                <DialogDescription>
                  This dialog hides the top-right close button. Users must use
                  the footer actions to dismiss.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant='ghost'>Cancel</Button>
                <Button variant='primary'>Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
      </Section>

      {/* Confirmation */}
      <Section title='Confirmation'>
        <Stack title='delete confirmation'>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='destructive'>Delete Issue</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Issue</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this issue? This action cannot
                  be undone and all associated data will be permanently removed.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant='ghost'>Cancel</Button>
                <Button variant='destructive'>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
        <Stack title='archive confirmation'>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='secondary'>Archive Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Archive Project</DialogTitle>
                <DialogDescription>
                  Archiving this project will hide it from the main view. You
                  can restore it from the archived projects section at any time.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant='ghost'>Cancel</Button>
                <Button variant='primary'>Archive</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
      </Section>

      {/* Form */}
      <Section title='Form'>
        <Stack title='create issue'>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='primary'>Create Issue</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Issue</DialogTitle>
                <DialogDescription>
                  Add a new issue to the current project.
                </DialogDescription>
              </DialogHeader>
              <div className='flex flex-col gap-3 py-2'>
                <div className='flex flex-col gap-1.5'>
                  <span
                    className='text-[13px] font-[450]'
                    style={{ color: 'var(--linear-text-primary)' }}
                  >
                    Title
                  </span>
                  <input
                    type='text'
                    placeholder='Issue title'
                    className='h-8 w-full rounded-(--linear-radius-md) border px-3 text-[13px] outline-none transition-colors focus:border-(--linear-border-focus)'
                    style={{
                      borderColor: 'var(--linear-border-subtle)',
                      backgroundColor: 'var(--linear-bg-surface-1)',
                      color: 'var(--linear-text-primary)',
                    }}
                  />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <span
                    className='text-[13px] font-[450]'
                    style={{ color: 'var(--linear-text-primary)' }}
                  >
                    Description
                  </span>
                  <textarea
                    placeholder='Add a description...'
                    rows={3}
                    className='w-full resize-none rounded-(--linear-radius-md) border px-3 py-2 text-[13px] outline-none transition-colors focus:border-(--linear-border-focus)'
                    style={{
                      borderColor: 'var(--linear-border-subtle)',
                      backgroundColor: 'var(--linear-bg-surface-1)',
                      color: 'var(--linear-text-primary)',
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant='ghost'>Cancel</Button>
                <Button variant='primary'>Create Issue</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
        <Stack title='rename project'>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='secondary'>Rename Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename Project</DialogTitle>
                <DialogDescription>
                  Enter a new name for this project.
                </DialogDescription>
              </DialogHeader>
              <div className='py-2'>
                <input
                  type='text'
                  defaultValue='My Project'
                  className='h-8 w-full rounded-(--linear-radius-md) border px-3 text-[13px] outline-none transition-colors focus:border-(--linear-border-focus)'
                  style={{
                    borderColor: 'var(--linear-border-subtle)',
                    backgroundColor: 'var(--linear-bg-surface-1)',
                    color: 'var(--linear-text-primary)',
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant='ghost'>Cancel</Button>
                <Button variant='primary'>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
      </Section>
    </div>
  );
}
