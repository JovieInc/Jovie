import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { checkedBinding } from './chat-performance-receipt';

export default class ChatPerformanceReporter implements Reporter {
  private chat?: { status: TestResult['status']; durationMs: number };
  private counts = {
    passed: 0,
    failed: 0,
    timedOut: 0,
    skipped: 0,
    interrupted: 0,
  };
  onTestEnd(test: TestCase, result: TestResult) {
    this.counts[result.status] += 1;
    if (!test.location.file.endsWith('/chat-performance-ratchet.spec.ts'))
      return;
    this.chat = { status: result.status, durationMs: result.duration };
  }

  onEnd() {
    writeFileSync(
      resolve(
        process.env.CHAT_COMPARISON_OUTPUT!,
        `smoke-${process.env.CHAT_COMPARISON_ATTEMPT}.json`
      ),
      JSON.stringify({
        schema: 'jovie-chat-smoke/v1',
        ...checkedBinding(JSON.parse(process.env.CHAT_COMPARISON_BINDING!)),
        counts: this.counts,
        chat: this.chat ?? null,
        attempt: Number(process.env.CHAT_COMPARISON_ATTEMPT),
        workers: 8,
      }),
      { flag: 'wx', mode: 0o600 }
    );
  }
}
