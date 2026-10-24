'use client';

import { useState } from 'react';
import {
  type UpdateAvailablePillState,
  UpdateAvailablePillView,
} from '@/components/atoms/UpdateAvailablePill';
import { useDesktopUpdate } from '@/lib/desktop/electron-bridge';
import { useWebUpdate } from '@/lib/version/use-web-update';

export function UpdateAvailablePill() {
  const desktop = useDesktopUpdate();
  const web = useWebUpdate();
  const [updating, setUpdating] = useState(false);

  const isAvailable = desktop.available || web.available;
  const isDesktopDownloading = desktop.available && !desktop.downloaded;

  if (!isAvailable) return null;

  function handleClick() {
    if (updating || isDesktopDownloading) return;
    setUpdating(true);

    if (desktop.available) {
      desktop.install();
    } else {
      web.reload();
    }
  }

  const state: UpdateAvailablePillState = (() => {
    if (updating) {
      return desktop.available ? 'restarting' : 'web-updating';
    }
    if (isDesktopDownloading) return 'downloading';
    if (desktop.downloaded) return 'ready-to-restart';
    return 'web-ready';
  })();

  return <UpdateAvailablePillView state={state} onClick={handleClick} />;
}
