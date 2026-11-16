import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { expect, it } from 'vitest';

/** @typedef {{ run?: string, uses?: string, with?: { path?: string } }} WorkflowStep */
/** @typedef {{ env?: Record<string, string>, steps: WorkflowStep[] }} WorkflowJob */

const workflow = /** @type {{ jobs: Record<string, WorkflowJob> }} */ (
  load(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/postdeploy-probes.yml'
      ),
      'utf8'
    )
  )
);

it('writes the crawl receipt under the artifact guard it uploads from', () => {
  // This job uploads only from the guard's producer stage. Run outside the
  // guard, the receipt never reached the stage and the upload was refused as
  // PLAYWRIGHT_ARTIFACT_SECRET_EXPOSURE inspection-error (run 42454821107).
  const job = workflow.jobs['product-crawl'];
  expect(job.env?.PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE).toBe('true');
  const crawl = job.steps.find(step =>
    step.run?.includes('scripts/product-crawl/crawl.mjs --origin')
  );
  const guarded = crawl?.run?.match(
    /PLAYWRIGHT_ARTIFACT_PATHS='([^']+)' \\\s+node \.github\/scripts\/guard-playwright-artifacts\.mjs --run -- \\\s+node scripts\/product-crawl\/crawl\.mjs/
  );
  expect(guarded?.[1]).toBe('product-crawl-receipt/*.json');
  const upload = job.steps.find(
    step => step.uses === './.github/actions/upload-safe-playwright-artifact'
  );
  expect(upload?.with?.path).toBe(guarded?.[1]);
});
