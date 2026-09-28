'use client';

import { Button } from '@jovie/ui';
import { DESKTOP_UPDATE_COPY } from '@/data/supportDesktopUpdateCopy';
import type { DesktopUpdateModalViewProps } from './DesktopUpdateModal';

const COPY = DESKTOP_UPDATE_COPY.modal;

type ModalState = DesktopUpdateModalViewProps['state'];

/**
 * The update modal's single primary action. Exactly one renders per state, so
 * this file carries exactly one primary-variant CTA
 * (one-primary-action-per-screen-v1).
 */
export function DesktopUpdateModalPrimaryAction({
  state,
  onDownload,
  onInstall,
  onRetry,
}: {
  readonly state: ModalState;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
  readonly onRetry: () => void;
}) {
  const action = (() => {
    switch (state.state) {
      case 'available':
        return { label: COPY.downloadAction, onClick: onDownload };
      case 'ready':
        return { label: COPY.restartAction, onClick: onInstall };
      case 'error':
        return { label: COPY.retryAction, onClick: onRetry };
      default:
        return null;
    }
  })();
  if (!action) return null;
  return (
    <Button variant='primary' onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
