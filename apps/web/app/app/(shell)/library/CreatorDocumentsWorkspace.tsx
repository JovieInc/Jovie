'use client';

import { Button } from '@jovie/ui';
import { FileText, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import {
  RichTextEditor,
  type RichTextEditorChange,
} from '@/components/organisms/RichTextEditor';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
import { richTextDocumentSchema } from '@/lib/rich-text/document';
import { capitalizeFirst } from '@/lib/utils/string-utils';

const DOCUMENT_DRAFT_KEY_PREFIX = 'jovie:creator-document-draft:v1:';
const IDEA_DRAFT_KEY_PREFIX = 'jovie:creator-idea-draft:v1:';

type EditorStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'claim-saved'
  | 'reviewed'
  | 'approved'
  | 'evidence-incomplete'
  | 'claim-ineligible'
  | 'conflict'
  | 'error';

function DocumentEditor({
  document,
  onClose,
  onSaved,
  onStageChanged,
  onDraftStateChange,
}: Readonly<{
  document: CreatorDocumentListItem;
  onClose: () => void;
  onSaved: (
    revision: number,
    title: string,
    kind: CreatorDocumentListItem['kind'],
    content: CreatorDocumentListItem['content'],
    plainText: string
  ) => void;
  onStageChanged: (stage: CreatorDocumentListItem['stage']) => void;
  onDraftStateChange: (hasDraft: boolean) => void;
}>) {
  const [title, setTitle] = useState(document.title);
  const [kind, setKind] = useState(document.kind);
  const [status, setStatus] = useState<EditorStatus>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [editorContent, setEditorContent] = useState(document.content);
  const [editorPlainText, setEditorPlainText] = useState(document.plainText);
  const [claimText, setClaimText] = useState('');
  const [claimKind, setClaimKind] = useState<
    'fact' | 'inference' | 'opinion' | 'anecdote'
  >('fact');
  const [evidenceState, setEvidenceState] = useState<
    'supported' | 'contested' | 'unresolved'
  >('supported');
  const [sourceRecordId, setSourceRecordId] = useState('');
  const editVersionRef = useRef(0);
  const claimVersionRef = useRef(0);
  const claimIdempotencyKeyRef = useRef<string | null>(null);
  const baseRevisionRef = useRef(document.currentRevision);
  const draftRestoredRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = globalThis.sessionStorage.getItem(
        `${DOCUMENT_DRAFT_KEY_PREFIX}${document.id}`
      );
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        const content = richTextDocumentSchema.safeParse(draft.content);
        if (
          typeof draft.title === 'string' &&
          (draft.kind === 'idea' ||
            draft.kind === 'research' ||
            draft.kind === 'script') &&
          content.success &&
          typeof draft.plainText === 'string' &&
          Number.isInteger(draft.baseRevision) &&
          Number(draft.baseRevision) > 0
        ) {
          baseRevisionRef.current = Number(draft.baseRevision);
          setTitle(draft.title);
          setKind(draft.kind);
          setEditorContent(content.data);
          setEditorPlainText(draft.plainText);
          setIsDirty(true);
          editVersionRef.current += 1;
        }
        if (typeof draft.claimText === 'string') {
          setClaimText(draft.claimText);
        }
        if (
          draft.claimKind === 'fact' ||
          draft.claimKind === 'inference' ||
          draft.claimKind === 'opinion' ||
          draft.claimKind === 'anecdote'
        ) {
          setClaimKind(draft.claimKind);
        }
        if (
          draft.evidenceState === 'supported' ||
          draft.evidenceState === 'contested' ||
          draft.evidenceState === 'unresolved'
        ) {
          setEvidenceState(draft.evidenceState);
        }
        if (typeof draft.sourceRecordId === 'string') {
          setSourceRecordId(draft.sourceRecordId);
        }
        if (typeof draft.claimIdempotencyKey === 'string') {
          claimIdempotencyKeyRef.current = draft.claimIdempotencyKey;
        }
      }
    } catch {
      // Ignore malformed or unavailable browser storage.
    } finally {
      draftRestoredRef.current = true;
    }
  }, [document.id]);
  const handleEditorChange = useCallback((change: RichTextEditorChange) => {
    editVersionRef.current += 1;
    setEditorContent(change.content);
    setEditorPlainText(change.plainText);
    setIsDirty(true);
    setStatus('idle');
  }, []);

  const post = useCallback(
    async (
      url: string,
      body: unknown,
      conflictStatus: Extract<
        EditorStatus,
        'conflict' | 'evidence-incomplete' | 'claim-ineligible'
      > = 'conflict'
    ) => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (response.status === 409) {
          const payload = (await response.json().catch(() => null)) as {
            code?: unknown;
          } | null;
          setStatus(
            payload?.code === 'evidence_incomplete'
              ? 'evidence-incomplete'
              : conflictStatus
          );
          return null;
        }
        if (!response.ok) throw new Error('Request failed');
        return response;
      } catch {
        setStatus('error');
        return null;
      }
    },
    []
  );

  const save = useCallback(async () => {
    if (status === 'saving') return;
    const editVersionAtSave = editVersionRef.current;
    const savedTitle = title;
    const savedKind = kind;
    const savedContent = editorContent;
    const savedPlainText = editorPlainText;
    setStatus('saving');
    try {
      const response = await fetch(`/api/library/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: baseRevisionRef.current,
          title: savedTitle,
          kind: savedKind,
          content: savedContent,
          plainText: savedPlainText,
        }),
      });
      if (response.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!response.ok) throw new Error('Save failed');
      const payload = (await response.json()) as { revision: number };
      baseRevisionRef.current = payload.revision;
      onSaved(
        payload.revision,
        savedTitle,
        savedKind,
        savedContent,
        savedPlainText
      );
      if (editVersionRef.current === editVersionAtSave) {
        setIsDirty(false);
        setStatus('saved');
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('error');
    }
  }, [document, editorContent, editorPlainText, kind, onSaved, status, title]);

  const addClaim = useCallback(async () => {
    if (status === 'saving') return;
    const claimVersionAtSave = claimVersionRef.current;
    claimIdempotencyKeyRef.current ??= globalThis.crypto.randomUUID();
    setStatus('saving');
    const draftKey = `${DOCUMENT_DRAFT_KEY_PREFIX}${document.id}`;
    try {
      globalThis.sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          title,
          kind,
          baseRevision: baseRevisionRef.current,
          content: editorContent,
          plainText: editorPlainText,
          claimText,
          claimKind,
          evidenceState,
          sourceRecordId,
          claimIdempotencyKey: claimIdempotencyKeyRef.current,
        })
      );
    } catch {
      // The request remains idempotent for this mounted session.
    }
    const response = await post(
      `/api/library/documents/${document.id}/claims`,
      {
        revision: document.currentRevision,
        idempotencyKey: claimIdempotencyKeyRef.current,
        claimText,
        kind: claimKind,
        evidenceState,
        sourceRecordId: sourceRecordId.trim() || null,
      },
      'claim-ineligible'
    );
    if (!response) return;
    if (claimVersionRef.current === claimVersionAtSave) {
      setClaimText('');
      setClaimKind('fact');
      setEvidenceState('supported');
      setSourceRecordId('');
      claimIdempotencyKeyRef.current = null;
      setStatus('claim-saved');
    } else {
      setStatus('idle');
    }
  }, [
    claimKind,
    claimText,
    document,
    editorContent,
    editorPlainText,
    evidenceState,
    kind,
    post,
    sourceRecordId,
    status,
    title,
  ]);

  const completeEvidenceReview = useCallback(async () => {
    if (status === 'saving') return;
    setStatus('saving');
    const response = await post(
      `/api/library/documents/${document.id}/review`,
      { revision: document.currentRevision }
    );
    if (!response) return;
    onStageChanged('evidence_review');
    setStatus('reviewed');
  }, [document, onStageChanged, post, status]);

  const approveForCapture = useCallback(async () => {
    if (status === 'saving' || isDirty || document.stage !== 'evidence_review')
      return;
    setStatus('saving');
    const response = await post(
      `/api/library/documents/${document.id}/approve`,
      { revision: document.currentRevision }
    );
    if (response) {
      onStageChanged('capture_ready');
      setStatus('approved');
      router.refresh();
    }
  }, [document, isDirty, onStageChanged, post, router, status]);

  const claimNeedsSource = evidenceState === 'supported';
  const hasClaimDraft =
    claimText.trim().length > 0 ||
    sourceRecordId.trim().length > 0 ||
    claimKind !== 'fact' ||
    evidenceState !== 'supported';
  const canAddClaim =
    document.stage === 'private_draft' &&
    !isDirty &&
    claimText.trim().length > 0 &&
    (!claimNeedsSource || sourceRecordId.trim().length > 0) &&
    status !== 'saving';

  useEffect(() => {
    if (!draftRestoredRef.current) return;
    const key = `${DOCUMENT_DRAFT_KEY_PREFIX}${document.id}`;
    try {
      if (!isDirty && !hasClaimDraft) {
        globalThis.sessionStorage.removeItem(key);
        return;
      }
      globalThis.sessionStorage.setItem(
        key,
        JSON.stringify({
          title,
          kind,
          baseRevision: baseRevisionRef.current,
          content: editorContent,
          plainText: editorPlainText,
          claimText,
          claimKind,
          evidenceState,
          sourceRecordId,
          claimIdempotencyKey: claimIdempotencyKeyRef.current,
        })
      );
    } catch {
      // Keep the in-memory draft even when browser storage is unavailable.
    }
  }, [
    claimKind,
    claimText,
    document.id,
    editorContent,
    editorPlainText,
    evidenceState,
    hasClaimDraft,
    isDirty,
    kind,
    sourceRecordId,
    title,
  ]);

  useEffect(() => {
    onDraftStateChange(isDirty || hasClaimDraft || status === 'saving');
    return () => onDraftStateChange(false);
  }, [hasClaimDraft, isDirty, onDraftStateChange, status]);

  return (
    <EntitySidebarShell
      isOpen
      width={480}
      ariaLabel='Private creator document'
      title='Document'
      onClose={onClose}
      scrollStrategy='shell'
      footer={
        <div className='flex min-h-9 flex-wrap items-center justify-between gap-2'>
          <span
            aria-live='polite'
            className='min-w-32 flex-1 text-xs text-secondary-token'
          >
            {status === 'saving'
              ? 'Saving…'
              : status === 'saved'
                ? 'Saved as a new revision'
                : status === 'claim-saved'
                  ? 'Claim added to this revision'
                  : status === 'reviewed'
                    ? 'Evidence review complete'
                    : status === 'approved'
                      ? 'Approved for capture'
                      : status === 'evidence-incomplete'
                        ? 'Resolve or source every factual claim, then retry.'
                        : status === 'claim-ineligible'
                          ? 'The revision changed or that source is not available.'
                          : status === 'conflict'
                            ? 'Revision changed. Reload before continuing.'
                            : status === 'error'
                              ? 'Action failed. Retry safely.'
                              : isDirty
                                ? 'Unsaved changes'
                                : 'Private document'}
          </span>
          <Button
            size='sm'
            onClick={save}
            disabled={status === 'saving' || !isDirty}
          >
            Save Revision
          </Button>
          {document.stage === 'evidence_review' ? (
            <Button
              size='sm'
              variant='secondary'
              onClick={approveForCapture}
              disabled={status === 'saving' || isDirty}
            >
              Approve For Capture
            </Button>
          ) : null}
        </div>
      }
    >
      <div className='flex min-w-0 flex-col gap-3 px-3 py-3'>
        <input
          aria-label='Document Title'
          value={title}
          onChange={event => {
            editVersionRef.current += 1;
            setTitle(event.target.value);
            setIsDirty(true);
            setStatus('idle');
          }}
          className='w-full bg-transparent text-lg font-semibold text-primary-token outline-none focus-visible:outline-2 focus-visible:outline-offset-2'
        />
        <label className='flex items-center justify-between gap-3 text-xs text-secondary-token'>
          Document Type
          <select
            aria-label='Document Type'
            value={kind}
            onChange={event => {
              editVersionRef.current += 1;
              setKind(event.target.value as CreatorDocumentListItem['kind']);
              setIsDirty(true);
              setStatus('idle');
            }}
            className='rounded-md border border-subtle bg-surface-1 px-2 py-1 text-primary-token focus-visible:outline-2 focus-visible:outline-offset-2'
          >
            <option value='idea'>Idea</option>
            <option value='research'>Research</option>
            <option value='script'>Script</option>
          </select>
        </label>
        <div className='grid grid-cols-2 gap-x-3 gap-y-1 border-y border-subtle py-2 text-xs text-secondary-token'>
          <span>Stage</span>
          <span className='text-right'>
            {capitalizeFirst(document.stage.replaceAll('_', ' '))}
          </span>
          <span>Revision</span>
          <span className='text-right'>R{document.currentRevision}</span>
          <span>Evidence</span>
          <span className='text-right'>
            {document.stage === 'private_draft'
              ? 'Open for review'
              : 'Ledger frozen'}
          </span>
          <span>Capture</span>
          <span className='text-right'>
            {document.stage === 'capture_ready'
              ? `R${document.currentRevision} handed to capture`
              : 'Not handed off'}
          </span>
        </div>
        <RichTextEditor
          content={editorContent}
          onChange={handleEditorChange}
          ariaLabel='Document Content'
          placeholder={
            kind === 'script'
              ? 'Write the scene, beat, or line…'
              : 'Start writing…'
          }
          statusLabel={
            status === 'saving'
              ? 'Saving…'
              : status === 'saved'
                ? `Saved · R${document.currentRevision}`
                : status === 'approved'
                  ? 'Approved for capture'
                  : status === 'conflict'
                    ? 'Conflict'
                    : status === 'evidence-incomplete'
                      ? 'Evidence incomplete'
                      : status === 'claim-ineligible'
                        ? 'Evidence unavailable'
                        : status === 'error'
                          ? 'Not saved'
                          : isDirty
                            ? 'Edited'
                            : `Revision ${document.currentRevision}`
          }
          statusTone={
            status === 'saving'
              ? 'pending'
              : status === 'saved' || status === 'approved'
                ? 'success'
                : status === 'conflict' ||
                    status === 'evidence-incomplete' ||
                    status === 'claim-ineligible' ||
                    status === 'error'
                  ? 'error'
                  : 'neutral'
          }
          minHeight='22rem'
        />
        {kind === 'script' && document.stage === 'private_draft' ? (
          <fieldset
            className='flex flex-col gap-2 border-t border-subtle pt-3'
            disabled={isDirty}
          >
            <legend className='text-sm font-medium text-primary-token'>
              Evidence Claim
            </legend>
            <textarea
              aria-label='Claim Text'
              value={claimText}
              onChange={event => {
                claimVersionRef.current += 1;
                claimIdempotencyKeyRef.current = null;
                setClaimText(event.target.value);
              }}
              placeholder='One factual statement from this exact script revision'
              className='min-h-20 resize-y rounded-md border border-subtle bg-surface-1 p-2 text-sm'
            />
            <div className='grid grid-cols-2 gap-2'>
              <select
                aria-label='Claim Type'
                value={claimKind}
                onChange={event => {
                  claimVersionRef.current += 1;
                  claimIdempotencyKeyRef.current = null;
                  const nextKind = event.target.value as typeof claimKind;
                  setClaimKind(nextKind);
                  if (nextKind === 'fact') setEvidenceState('supported');
                }}
                className='rounded-md border border-subtle bg-surface-1 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2'
              >
                <option value='fact'>Fact</option>
                <option value='inference'>Inference</option>
                <option value='opinion'>Opinion</option>
                <option value='anecdote'>Anecdote</option>
              </select>
              <select
                aria-label='Evidence State'
                value={evidenceState}
                onChange={event => {
                  claimVersionRef.current += 1;
                  claimIdempotencyKeyRef.current = null;
                  setEvidenceState(event.target.value as typeof evidenceState);
                }}
                className='rounded-md border border-subtle bg-surface-1 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2'
              >
                <option value='supported'>Supported</option>
                {claimKind === 'fact' ? null : (
                  <>
                    <option value='contested'>Contested</option>
                    <option value='unresolved'>Unresolved</option>
                  </>
                )}
              </select>
            </div>
            <input
              aria-label='Memory Source Record ID'
              value={sourceRecordId}
              onChange={event => {
                claimVersionRef.current += 1;
                claimIdempotencyKeyRef.current = null;
                setSourceRecordId(event.target.value);
              }}
              placeholder='Private memory source record ID'
              className='rounded-md border border-subtle bg-surface-1 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2'
            />
            <div className='flex flex-wrap gap-2'>
              <Button
                size='sm'
                variant='secondary'
                onClick={addClaim}
                disabled={!canAddClaim}
              >
                Add Claim
              </Button>
              <Button
                size='sm'
                variant='secondary'
                onClick={completeEvidenceReview}
                disabled={status === 'saving' || isDirty || hasClaimDraft}
              >
                Complete Evidence Review
              </Button>
            </div>
            <p
              aria-hidden={!isDirty}
              className={`min-h-4 text-xs text-secondary-token ${isDirty ? '' : 'invisible'}`}
            >
              Save this revision before reviewing its claims.
            </p>
          </fieldset>
        ) : null}
      </div>
    </EntitySidebarShell>
  );
}

export function CreatorDocumentsWorkspace({
  creatorProfileId,
  initialDocuments,
  initialNextCursor = null,
  initialLoadFailed = false,
  onUnsavedDraftChange,
  onDiscardDraftsReady,
}: Readonly<{
  creatorProfileId: string;
  initialDocuments: readonly CreatorDocumentListItem[];
  initialNextCursor?: string | null;
  initialLoadFailed?: boolean;
  onUnsavedDraftChange?: (hasDraft: boolean) => void;
  onDiscardDraftsReady?: (discard: (() => void) | null) => void;
}>) {
  const [documents, setDocuments] = useState([...initialDocuments]);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [listStatus, setListStatus] = useState<'idle' | 'loading' | 'error'>(
    initialLoadFailed ? 'error' : 'idle'
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ideaStatus, setIdeaStatus] = useState<'idle' | 'saving' | 'error'>(
    'idle'
  );
  const ideaIdempotencyKey = useRef<string | null>(null);
  const ideaDraftKey = `${IDEA_DRAFT_KEY_PREFIX}${creatorProfileId}`;
  const ideaDraftRestoredRef = useRef(false);
  const [hasDocumentDraft, setHasDocumentDraft] = useState(false);
  const hasIdeaDraft =
    ideaStatus === 'saving' ||
    title.trim().length > 0 ||
    body.trim().length > 0;
  const hasUnsavedDraft = hasDocumentDraft || hasIdeaDraft;
  const selected =
    documents.find(document => document.id === selectedId) ?? null;

  useEffect(() => {
    try {
      const raw = globalThis.sessionStorage.getItem(ideaDraftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        if (typeof draft.title === 'string' && typeof draft.body === 'string') {
          setTitle(draft.title);
          setBody(draft.body);
          setShowCapture(true);
          if (typeof draft.idempotencyKey === 'string') {
            ideaIdempotencyKey.current = draft.idempotencyKey;
          }
        }
      }
    } catch {
      // Ignore malformed or unavailable browser storage.
    } finally {
      ideaDraftRestoredRef.current = true;
    }
  }, [ideaDraftKey]);

  useEffect(() => {
    if (!ideaDraftRestoredRef.current) return;
    try {
      if (!title.trim() && !body.trim()) {
        globalThis.sessionStorage.removeItem(ideaDraftKey);
      } else {
        globalThis.sessionStorage.setItem(
          ideaDraftKey,
          JSON.stringify({
            title,
            body,
            idempotencyKey: ideaIdempotencyKey.current,
          })
        );
      }
    } catch {
      // Keep the in-memory draft even when browser storage is unavailable.
    }
  }, [body, ideaDraftKey, title]);

  useEffect(() => {
    onUnsavedDraftChange?.(hasUnsavedDraft);
    return () => onUnsavedDraftChange?.(false);
  }, [hasUnsavedDraft, onUnsavedDraftChange]);

  useEffect(() => {
    if (!hasUnsavedDraft) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    globalThis.addEventListener('beforeunload', warnBeforeUnload);
    return () =>
      globalThis.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedDraft]);

  const confirmDiscardDraft = useCallback(() => {
    if (!hasUnsavedDraft) return true;
    return globalThis.confirm('Discard your unsaved document changes?');
  }, [hasUnsavedDraft]);

  const discardPersistedDrafts = useCallback(() => {
    try {
      globalThis.sessionStorage.removeItem(ideaDraftKey);
      if (selectedId) {
        globalThis.sessionStorage.removeItem(
          `${DOCUMENT_DRAFT_KEY_PREFIX}${selectedId}`
        );
      }
    } catch {
      // The in-memory draft is still discarded if storage is unavailable.
    }
    setTitle('');
    setBody('');
    setShowCapture(false);
    setIdeaStatus('idle');
    ideaIdempotencyKey.current = null;
    setHasDocumentDraft(false);
  }, [ideaDraftKey, selectedId]);

  useEffect(() => {
    onDiscardDraftsReady?.(discardPersistedDrafts);
    return () => onDiscardDraftsReady?.(null);
  }, [discardPersistedDrafts, onDiscardDraftsReady]);

  const selectDocument = useCallback(
    (documentId: string | null) => {
      if (documentId === selectedId || !confirmDiscardDraft()) return;
      discardPersistedDrafts();
      setSelectedId(documentId);
    },
    [confirmDiscardDraft, discardPersistedDrafts, selectedId]
  );

  const updateSelected = useCallback(
    (changes: Partial<CreatorDocumentListItem>) => {
      if (!selectedId) return;
      setDocuments(current =>
        current.map(item =>
          item.id === selectedId ? { ...item, ...changes } : item
        )
      );
    },
    [selectedId]
  );

  const panel = useMemo(
    () =>
      selected ? (
        <DocumentEditor
          key={selected.id}
          document={selected}
          onClose={() => selectDocument(null)}
          onSaved={(revision, savedTitle, savedKind, content, plainText) =>
            updateSelected({
              title: savedTitle,
              kind: savedKind,
              content,
              plainText,
              currentRevision: revision,
              stage: 'private_draft',
            })
          }
          onStageChanged={stage => updateSelected({ stage })}
          onDraftStateChange={setHasDocumentDraft}
        />
      ) : null,
    [selectDocument, selected, updateSelected]
  );
  useRegisterRightPanel(panel);

  const loadDocuments = useCallback(async (cursor: string | null) => {
    setListStatus('loading');
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const response = await fetch(`/api/library/documents${query}`);
      if (!response.ok) throw new Error('Document load failed');
      const page = (await response.json()) as {
        documents: CreatorDocumentListItem[];
        nextCursor: string | null;
      };
      setDocuments(current =>
        cursor
          ? [
              ...current,
              ...page.documents.filter(
                incoming => !current.some(item => item.id === incoming.id)
              ),
            ]
          : page.documents
      );
      setNextCursor(page.nextCursor);
      setListStatus('idle');
    } catch {
      setListStatus('error');
    }
  }, []);

  const saveIdea = useCallback(async () => {
    if (ideaStatus === 'saving') return;
    ideaIdempotencyKey.current ??= globalThis.crypto.randomUUID();
    try {
      globalThis.sessionStorage.setItem(
        ideaDraftKey,
        JSON.stringify({
          title,
          body,
          idempotencyKey: ideaIdempotencyKey.current,
        })
      );
    } catch {
      // The request remains idempotent for this mounted session.
    }
    setIdeaStatus('saving');
    try {
      const response = await fetch('/api/library/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          idempotencyKey: ideaIdempotencyKey.current,
        }),
      });
      if (!response.ok) throw new Error('Capture failed');
      try {
        globalThis.sessionStorage.removeItem(ideaDraftKey);
      } catch {
        // The durable server write succeeded even if browser cleanup is blocked.
      }
      globalThis.location.reload();
    } catch {
      setIdeaStatus('error');
    }
  }, [body, ideaDraftKey, ideaStatus, title]);

  return (
    <section
      aria-label='Private Creator Documents'
      className='min-h-0 flex-1 overflow-auto p-4'
    >
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-4'>
        {listStatus === 'error' ? (
          <div
            role='alert'
            className='flex min-h-12 items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm'
          >
            <span>
              Private documents could not be loaded. Your work is still saved.
            </span>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => void loadDocuments(null)}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h1 className='text-lg font-semibold text-primary-token'>
              Ideas And Scripts
            </h1>
            <p className='text-sm text-secondary-token'>
              Private until you approve one exact script revision.
            </p>
          </div>
          <Button
            size='sm'
            onClick={() => {
              if (showCapture) {
                if (!confirmDiscardDraft()) return;
                discardPersistedDrafts();
                return;
              }
              setShowCapture(true);
            }}
          >
            <Plus className='h-4 w-4' aria-hidden='true' /> Save Idea
          </Button>
        </div>
        {showCapture ? (
          <div className='flex flex-col gap-2 border-y border-subtle py-3'>
            <input
              aria-label='Idea Title'
              value={title}
              disabled={ideaStatus === 'saving'}
              onChange={event => {
                if (ideaStatus === 'error') {
                  ideaIdempotencyKey.current = null;
                  setIdeaStatus('idle');
                }
                setTitle(event.target.value);
              }}
              placeholder='What is the idea?'
              className='bg-transparent text-base font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2'
            />
            <textarea
              aria-label='Idea Details'
              value={body}
              disabled={ideaStatus === 'saving'}
              onChange={event => {
                if (ideaStatus === 'error') {
                  ideaIdempotencyKey.current = null;
                  setIdeaStatus('idle');
                }
                setBody(event.target.value);
              }}
              placeholder='Dump the thought here. Research comes later.'
              className='min-h-28 resize-y rounded-md border border-subtle bg-surface-1 p-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2'
            />
            <div className='flex items-center gap-3'>
              <Button
                size='sm'
                onClick={saveIdea}
                disabled={
                  !title.trim() || !body.trim() || ideaStatus === 'saving'
                }
              >
                {ideaStatus === 'error'
                  ? 'Retry Private Save'
                  : 'Save Privately'}
              </Button>
              <span aria-live='polite' className='text-xs text-secondary-token'>
                {ideaStatus === 'saving'
                  ? 'Saving…'
                  : ideaStatus === 'error'
                    ? 'Not confirmed. Retry uses the same private capture key.'
                    : ''}
              </span>
            </div>
          </div>
        ) : null}
        <div className='divide-y divide-subtle border-y border-subtle'>
          {documents.length === 0 && listStatus !== 'error' ? (
            <div className='flex flex-col items-center gap-2 py-12 text-center text-secondary-token'>
              <FileText className='h-5 w-5' aria-hidden='true' />
              <p className='text-sm'>No ideas yet. Save the first one.</p>
            </div>
          ) : (
            documents.map(document => (
              <Button
                key={document.id}
                type='button'
                variant='ghost'
                onClick={() => selectDocument(document.id)}
                className='flex w-full items-center justify-between gap-4 px-3 py-3 text-left hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
              >
                <span className='min-w-0 truncate text-sm font-medium text-primary-token'>
                  {document.title}
                </span>
                <span className='shrink-0 text-xs text-secondary-token'>
                  {capitalizeFirst(document.kind)} · R{document.currentRevision}
                </span>
              </Button>
            ))
          )}
        </div>
        {nextCursor ? (
          <Button
            type='button'
            variant='secondary'
            disabled={listStatus === 'loading'}
            onClick={() => void loadDocuments(nextCursor)}
          >
            {listStatus === 'loading' ? 'Loading…' : 'Load Older Documents'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
