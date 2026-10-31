import 'server-only';

import spendRegistry from '../../../../../ops/registry/spend.json';
import { getSummerRevenue } from '../summer-company.server';
import { type DefaultAliveResult, evaluateDefaultAlive } from './engine';
import {
  type AttestedFinance,
  assembleDefaultAliveInputs,
  mrrFromSummerRevenue,
  variableBurnFromSpendRegistry,
} from './inputs';

/**
 * Company evidence: default alive or dead, wired to live sources. MRR comes
 * from Summer's Stripe revenue read, variable burn from the spend registry
 * caps. Cash and fixed burn are founder-attested (no bank connector yet), so
 * without an attestation they come back as explicit gaps.
 */
export async function getDefaultAliveEvidence(
  attested: AttestedFinance | null,
  now = new Date()
): Promise<DefaultAliveResult> {
  const revenue = await getSummerRevenue(now);
  const inputs = assembleDefaultAliveInputs({
    attested,
    mrr: mrrFromSummerRevenue(revenue),
    variableBurn: variableBurnFromSpendRegistry(spendRegistry),
  });
  return evaluateDefaultAlive(inputs, now.toISOString());
}
