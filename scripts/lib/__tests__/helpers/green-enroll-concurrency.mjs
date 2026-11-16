// Evaluate the maintained workflow expressions without GitHub or a scheduler.
function formatExpression(template, ...args) {
  return template.replace(/\{(\d+)\}/g, (_whole, index) =>
    String(args[Number(index)] ?? '')
  );
}

function evalWorkflowExpr(expression, github) {
  const js = expression
    .replaceAll(
      'github.event.pull_request.number',
      'github.event.pull_request?.number'
    )
    .replaceAll(
      'github.event.workflow_run.pull_requests[0].number',
      'github.event.workflow_run?.pull_requests?.[0]?.number'
    )
    .replaceAll(
      'github.event.workflow_run.head_sha',
      'github.event.workflow_run?.head_sha'
    )
    .replaceAll(
      'github.event.workflow_run.name',
      'github.event.workflow_run?.name'
    )
    .replaceAll('github.event.workflow_run.id', 'github.event.workflow_run?.id')
    .replaceAll(
      'github.event.workflow_run.conclusion',
      'github.event.workflow_run?.conclusion'
    )
    .replaceAll(
      'github.event.workflow_run.event',
      'github.event.workflow_run?.event'
    );
  return new Function('github', 'inputs', 'format', `return (${js});`)(
    github,
    github.inputs ?? {},
    formatExpression
  );
}

export function workflowConcurrency(workflow) {
  const concurrencyGroup = github =>
    workflow.concurrency.group.replace(
      /\$\{\{([\s\S]*?)\}\}/g,
      (_whole, expression) => evalWorkflowExpr(expression, github)
    );
  const cancelInProgress = github => {
    const value = workflow.concurrency['cancel-in-progress'];
    if (typeof value !== 'string') return value;
    const match = value.match(/^\$\{\{([\s\S]*)\}\}$/);
    if (!match) return value;
    return evalWorkflowExpr(match[1].trim(), github);
  };
  return { concurrencyGroup, cancelInProgress };
}

export const successfulPrWake = (
  head,
  id,
  number = 7,
  name = 'Source Validation'
) => ({
  event_name: 'workflow_run',
  event: {
    workflow_run: {
      id,
      name,
      conclusion: 'success',
      event: 'pull_request',
      head_sha: head,
      pull_requests: number ? [{ number }] : [],
    },
  },
  run_id: id + 1000,
});
