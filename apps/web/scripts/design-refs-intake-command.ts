import { runDesignRefsIntake } from '@/lib/agent-os/design-reference-corpus/intake/run';
import type { DesignRefsDeps } from './design-refs';
import type { Flags } from './design-refs-flags';
import { loadCorpus, writeCorpus } from './design-refs-store';

export async function commandDesignRefsIntake(
  flags: Flags,
  deps: DesignRefsDeps
): Promise<number> {
  return runDesignRefsIntake(
    {
      dir: deps.dir,
      cacheDir: deps.cacheDir,
      loadCorpus: () => loadCorpus(deps.dir),
      writeCorpus: corpus => writeCorpus(deps.dir, corpus),
      captureUrl: async (url, viewport) => {
        const captured = await deps.captureUrl(url, viewport);
        return {
          jpeg: captured.jpeg,
          title: captured.title,
          via: captured.via,
        };
      },
      now: deps.now,
      log: deps.log,
      scheduled: flags.switches.has('scheduled') || flags.switches.has('cron'),
    },
    {
      dry: flags.switches.has('dry'),
      surface: flags.values.get('surface'),
      limitPerSurface: flags.values.has('limit')
        ? Number(flags.values.get('limit'))
        : undefined,
      includeStaging: flags.switches.has('staging'),
    }
  );
}
