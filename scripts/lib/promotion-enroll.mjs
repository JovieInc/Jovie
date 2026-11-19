// Candidate-only evidence for the existing enroll controller. No roster reads.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { githubIo, reconcileQueueRetry } from './promotion-github.mjs';

export function createEnrollPromotion({ core, env, repository, net }) {
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
    retry({ failure = undefined, ...input }) {
      const transport = io();
      return reconcileQueueRetry(
        {
          ...input,
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
                receipts: evidence.receipts.filter(r => r.run !== latest.runId),
                runs: evidence.runs.filter(r => r.id !== latest.runId),
              };
            }
            // Admission-quota recovery is a trusted, head-bound infra receipt too.
            if (
              failure.reason === 'bounded-admission-recovery' &&
              !evidence.receipts.some(r => r.run === latest.runId)
            ) {
              return {
                ...evidence,
                receipts: [
                  ...evidence.receipts,
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
    },
    reserveRetry(head, decision) {
      const last = decision.evidence.receipts.at(-1);
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
