/**
 * Guards `pnpm preflight:changed` runs before a push that PR CI does not run
 * itself: the merge group's ci-fast and Build + Layout jobs run them, so a
 * PR that breaks one is first caught in the queue.
 *
 * In the merge groups of 2026-11-08 to 11-11 (79 failed groups sampled),
 * design-noise failed 8 (10%), e.g. "PmfSurveyCard.tsx disabled-submit x1
 * (baseline 0)", and the route JS budgets failed 10 (13%), e.g. "/ ships 664
 * KB gzip; budget is 663 KB" on the homepage.
 *
 *  - design-noise: static, about 0.5 s, so it runs in every mode, --fast too.
 *  - route-js-budget: reads a finished `next build`, so it is heavy and runs
 *    with --thorough (or on the remote backend). Same build env as Source
 *    Validation's "Build exact PR head", so both measure the same bundles.
 *
 * Each guard: { id, name, command, when (changed-path RegExp), heavy?,
 * timeoutMs? }. Budgets and baselines are read, never changed, here.
 */

const WEB_TEST_OR_STORY =
  /(?:^|\/)(?:__tests__|tests|fixtures)\/|\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;

/** apps/web or packages/ui source that ships in the client or server build. */
const BUILD_INPUT =
  /^(?:apps\/web\/(?!scripts\/|tests\/|e2e\/|docs\/).+\.(?:[cm]?[jt]sx?|css|json)$|packages\/[^/]+\/.+\.(?:[cm]?[jt]sx?|css|json)$|apps\/web\/(?:next\.config\.[cm]?[jt]s|package\.json)$|pnpm-lock\.yaml$)/;

const ROUTE_JS_INPUT =
  /^apps\/web\/scripts\/(?:route-js-budget\.mjs|route-js-budgets\.json)$/;

const BUILD_ENV = [
  'NEXT_PUBLIC_APP_URL=http://localhost:3230',
  'NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3230',
  'NEXT_PUBLIC_AUTH_MOCK=1',
  'NEXT_PUBLIC_AUTH_PROXY_DISABLED=1',
  'NEXT_PUBLIC_E2E_MODE=1',
  'NEXT_IGNORE_ESLINT=1',
  'NEXT_IGNORE_TYPECHECK=1',
  'NEXT_PRIVATE_SKIP_SIZE_CHECK=true',
].join(' ');

/** @type {readonly {id:string,name:string,command:string,when:(p:string)=>boolean,heavy?:boolean,timeoutMs?:number}[]} */
export const LOCAL_GUARDS = Object.freeze([
  {
    id: 'design-noise',
    name: 'design-noise lint (apps/web/design-noise.baseline.json)',
    command: 'node apps/web/scripts/lint-design-noise.mjs',
    when: p =>
      /^(?:apps\/web|packages\/ui)\/.+\.tsx$/.test(p) ||
      /^apps\/web\/(?:design-noise\.baseline\.json|scripts\/lint-design-noise\.mjs)$/.test(
        p
      ) ||
      p === 'scripts/lib/shrink-only-baseline.mjs',
  },
  {
    id: 'route-js-budget',
    name: 'route JS budgets on a production build (apps/web/scripts/route-js-budgets.json)',
    command: `${BUILD_ENV} pnpm turbo build --filter=@jovie/web && node apps/web/scripts/route-js-budget.mjs --next-dir apps/web/.next`,
    when: p =>
      ROUTE_JS_INPUT.test(p) ||
      (BUILD_INPUT.test(p) && !WEB_TEST_OR_STORY.test(p)),
    heavy: true,
    timeoutMs: 1_800_000,
  },
]);

/** The local guards a change selects, in LOCAL_GUARDS order. */
export function selectLocalGuards(paths) {
  return LOCAL_GUARDS.filter(guard => paths.some(p => guard.when(p)));
}
