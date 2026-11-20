// Candidate-only evidence for the existing enroll controller. No roster reads.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { retryDisposition } from './merge-queue-retry-policy.mjs';
import { githubIo, reconcileQueueRetry } from './promotion-github.mjs';

export function createEnrollPromotion({
  core,
  env,
  repository,
  github = undefined,
  net,
}) {
  const repo = `${repository.owner}/${repository.repo}`;
  let transport;
  const io = () => {
    if (transport) return transport;
    transport = net ?? githubIo({ repo, token: env.RECHECK_TOKEN });
    const readHealth = transport.health;
    let health;
    transport.health = () => (health ??= readHealth());
    return transport;
  };
  const report = error => {
    const json = JSON.stringify({
      schema: 'promotion-bar/v1',
      mode: 'shadow',
      ready: false,
      failures: ['collector'],
      errors: [error.message],
    });
    core.info(json);
    try {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(env.GITHUB_STEP_SUMMARY, `\n${json}\n`);
    } catch {
      /* observation never fails admission */
    }
  };
  return {
    async retry({ failure = undefined, ...input }) {
      // Holds have already been evaluated by the existing failure controller.
      // A replacement head inherits neither its predecessor's ledger nor health.
      if (failure?.action === 'block')
        return { allow: false, reason: failure.reason, retry: false };
      if (!input.removed && !failure?.latest)
        return retryDisposition({ head: input.head, complete: true });
      const fallback = error => {
        core.info(
          JSON.stringify({
            schema: 'mq-retry/v1',
            mode: 'shadow',
            pr: input.pr,
            head: input.head,
            reason: 'retry-evidence-unavailable',
            error,
          })
        );
        return {
          allow: true,
          reason: 'retry-evidence-unavailable',
          retry: false,
        };
      };
      try {
        const transport = io();
        const decision = await reconcileQueueRetry(
          {
            ...input,
            unheld:
              failure?.action === 'allow' ||
              [
                'bounded-admission-recovery',
                'bounded-infrastructure-recovery',
              ].includes(failure?.reason),
            removed: input.removed && failure?.action !== 'retry-once',
            released:
              input.released || failure?.reason === 'human-failure-release',
          },
          {
            ...transport,
            async readRetryEvidence(candidate) {
              const evidence = await transport.readRetryEvidence(candidate);
              const latest = failure?.latest;
              if (failure?.action !== 'retry-once' || !latest) return evidence;
              // Existing exact-run authorization is already validated by the failure
              // controller. Preserve explicit human release and changed-base recovery;
              // neither releases a different failure on this head.
              if (
                failure.reason === 'human-failure-release' ||
                latest.classification === 'base-branch'
              ) {
                return {
                  ...evidence,
                  receipts: evidence.receipts.filter(
                    r => r.run !== latest.runId
                  ),
                  runs: evidence.runs.filter(r => r.id !== latest.runId),
                };
              }
              // The existing failure controller, not the advisory ejection
              // classifier, authorizes this exact infrastructure recovery.
              if (
                [
                  'bounded-admission-recovery',
                  'bounded-infrastructure-recovery',
                ].includes(failure.reason)
              ) {
                return {
                  ...evidence,
                  receipts: [
                    ...evidence.receipts.filter(r => r.run !== latest.runId),
                    {
                      schema: 'ejection/v1',
                      head: input.head,
                      run: latest.runId,
                      attempt: latest.runAttempt,
                      class: 'infra',
                    },
                  ],
                };
              }
              return evidence;
            },
          }
        );
        if (decision.unavailable) return fallback(decision.unavailable);
        if (
          decision.retry &&
          !decision.evidence?.receipts.some(
            r => r.head === input.head && Number.isSafeInteger(r.run)
          )
        )
          return fallback('no head-bound failed run for a retry reservation');
        return decision;
      } catch (error) {
        return fallback(String(error?.message ?? error));
      }
    },
    reserveRetry(head, decision) {
      const last = decision.evidence.receipts
        .filter(r => r.head === head)
        .at(-1);
      // Evidence uses the job token; reservations use the existing app writer.
      if (github)
        return github.rest.repos.createCommitStatus({
          ...repository,
          sha: head,
          state: 'success',
          context: 'mq-retry/v1',
          description: `spent:run=${last.run};try=${last.attempt ?? 1}`,
          target_url: `https://github.com/${repo}/actions/runs/${last.run}`,
        });
      return io().reserveRetry({ head, run: last.run, attempt: last.attempt });
    },
    async logPromotion(pr) {
      try {
        const promotion = await import('./promotion-readiness-collect.mjs');
        const policy = execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim();
        await promotion.logPromotion(
          { repo, pr: pr.number, expectedHead: pr.headRefOid },
          promotion.collectorIo({
            repo,
            token: env.RECHECK_TOKEN,
            policy,
            maxLines: Number(env.MAX_LINES),
            maxFiles: Number(env.MAX_FILES),
          }),
          { summary: env.GITHUB_STEP_SUMMARY, log: json => core.info(json) }
        );
      } catch (error) {
        report(error);
      }
    },
  };
}
