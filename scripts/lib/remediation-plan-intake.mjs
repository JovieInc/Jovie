export async function fileRemediationPlans(plans, { dryRun, upsert, apiKey }) {
  if (dryRun) return plans.map(plan => ({ ...plan, action: 'dry-run' }));
  const filed = [];
  for (const plan of plans) {
    const result = await upsert({
      fingerprint: plan.fingerprint,
      title: plan.title,
      description: plan.description,
      priority: plan.priority,
      createStateName: 'Todo',
      reopenTerminal: true,
      apiKey,
    });
    if (!result?.ok) {
      throw new Error(
        `${plan.fingerprint}: ${result?.reason || 'linear_upsert_failed'}`
      );
    }
    filed.push({
      fingerprint: plan.fingerprint,
      title: plan.title,
      action: result.action,
      reopened: result.reopened === true,
      identifier: result.identifier ?? null,
      url: result.url ?? null,
    });
  }
  return filed;
}
