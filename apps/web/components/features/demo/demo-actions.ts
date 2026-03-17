'use client';

import { toast } from 'sonner';

interface DemoActionOptions {
  readonly successMessage: string;
  readonly loadingMessage?: string;
  readonly latencyMs?: number;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runDemoAction({
  successMessage,
  loadingMessage,
  latencyMs = 350,
}: DemoActionOptions): Promise<void> {
  const loader = loadingMessage ? toast.loading(loadingMessage) : null;
  await wait(latencyMs);
  if (loader) {
    toast.dismiss(loader);
  }
  toast.success(successMessage);
}
