'use client';

import { useEffect } from 'react';
import {
  readModelContext,
  registerJovieWebMcpTools,
} from '@/lib/agent-ready/web-mcp';

/** Registers read-only WebMCP tools when the browser exposes modelContext. */
export function WebMcpTools() {
  useEffect(() => {
    const context = readModelContext(document, navigator);
    if (!context) return;
    const controller = new AbortController();
    try {
      registerJovieWebMcpTools(context, fetch, controller.signal);
    } catch {
      // Feature-detected progressive enhancement; never break the page.
    }
    return () => controller.abort();
  }, []);
  return null;
}
