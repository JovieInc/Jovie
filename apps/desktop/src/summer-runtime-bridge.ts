export const SUMMER_LOCAL_RUNTIME_STATUS = 'retired-awaiting-eve' as const;
export const SUMMER_LOCAL_RUNTIME_ERROR =
  'summer-local-runtime-retired-eve-unavailable' as const;

type SummerPendingTurn = {
  readonly id: string;
  readonly conversation_id: string;
  readonly user_text: string;
};

type SummerClaimedTurn = SummerPendingTurn & {
  readonly claim_token: string;
};

export type SummerBridgeReceipt = {
  readonly cycle: number;
  readonly state:
    | 'idle'
    | 'completed'
    | 'claim-conflict'
    | 'http-error'
    | 'runtime-error';
  readonly turnId?: string;
  readonly errorCode?: string;
};

export type SummerRuntimeBridge = {
  start(): void;
  stop(): void;
  runCycle(): Promise<SummerBridgeReceipt>;
};

type SummerBridgeFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

const SUMMER_TOOL_FENCE = /```summer-tool\s*\r?\n([\s\S]*?)\r?\n```/;

export type SummerRuntimeTool = {
  readonly name: string;
  readonly ok: boolean;
  readonly receiptId: string;
  readonly summary: string;
};

export type SummerRuntimeCompletion = {
  readonly responseText: string;
  readonly tool?: SummerRuntimeTool;
};

export function parseSummerRuntimeCompletion(
  stdout: string
): SummerRuntimeCompletion {
  const match = stdout.match(SUMMER_TOOL_FENCE);
  if (!match) return { responseText: stdout.trim() };
  const responseText = stdout.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1] ?? '') as Record<string, unknown>;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.receiptId === 'string' &&
      typeof parsed.summary === 'string'
    ) {
      return {
        responseText,
        tool: {
          name: parsed.name,
          ok: parsed.ok === true,
          receiptId: parsed.receiptId,
          summary: parsed.summary,
        },
      };
    }
  } catch {
    // Malformed fence is ignored; founder text still completes.
  }
  return { responseText };
}

/**
 * The local executor is deliberately unavailable after the founder-retired
 * runtime was archived. Eve must earn exact identity, deployment, persistence,
 * privacy, failure, and recurrence proof before another executor is wired.
 */
export async function invokeSummerRuntime(_input: {
  readonly homeDirectory: string;
  readonly turn: SummerClaimedTurn;
  readonly spawnProcess?: unknown;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}): Promise<SummerRuntimeCompletion> {
  throw new Error(SUMMER_LOCAL_RUNTIME_ERROR);
}

export function createSummerRuntimeBridge(input: {
  readonly platform: NodeJS.Platform;
  readonly appOrigin: string;
  readonly homeDirectory: string;
  readonly fetch: SummerBridgeFetch;
  readonly workerId: string;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly onReceipt?: (receipt: SummerBridgeReceipt) => void;
}): SummerRuntimeBridge {
  let started = false;
  let cycle = 0;

  const runCycle = async (): Promise<SummerBridgeReceipt> => {
    cycle += 1;
    const receipt: SummerBridgeReceipt =
      input.platform === 'darwin'
        ? {
            cycle,
            state: 'runtime-error',
            errorCode: SUMMER_LOCAL_RUNTIME_ERROR,
          }
        : { cycle, state: 'idle' };
    input.onReceipt?.(receipt);
    return receipt;
  };

  return {
    start() {
      if (started) return;
      started = true;
      void runCycle();
    },
    stop() {
      started = false;
    },
    runCycle,
  };
}
