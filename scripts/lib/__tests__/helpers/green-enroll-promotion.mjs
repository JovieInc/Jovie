// Exercise the real shared API client and retry collector without live GitHub.
export async function withPromotionNetwork(
  { statuses, statusWrites, reads, runs = [] },
  run
) {
  const original = globalThis.fetch;
  const state = process.env.JOVIE_API_STATE;
  process.env.JOVIE_API_STATE = 'memory';
  globalThis.fetch = async (url, options) => {
    const target = new URL(url);
    reads.push({
      path: target.pathname,
      branch: target.searchParams.get('branch'),
    });
    let data;
    if (target.pathname.endsWith('/actions/runs')) {
      data = {
        total_count: 0,
        workflow_runs: target.searchParams.has('branch')
          ? runs
          : [
              {
                id: 10,
                name: 'CI',
                event: 'push',
                head_branch: 'main',
                conclusion: 'success',
              },
            ],
      };
    } else if (target.pathname.endsWith('/artifacts')) {
      data = { total_count: 0, artifacts: [] };
    } else if (target.pathname.endsWith('/jobs')) {
      data = {
        total_count: 1,
        jobs: [{ name: 'runner timed out', conclusion: 'timed_out' }],
      };
    } else if (/\/commits\/[^/]+\/statuses$/.test(target.pathname)) {
      data = statuses;
    } else if (
      /\/statuses\/[^/]+$/.test(target.pathname) &&
      options.method === 'POST'
    ) {
      data = JSON.parse(options.body);
      statusWrites.push(data);
    } else if (target.pathname.endsWith('/dispatches')) {
      return original(url, options);
    } else {
      // The shadow collector must tolerate missing evidence without blocking enqueue.
      throw new Error(
        `offline promotion evidence unavailable: ${target.pathname}`
      );
    }
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
    if (state === undefined) delete process.env.JOVIE_API_STATE;
    else process.env.JOVIE_API_STATE = state;
  }
}
