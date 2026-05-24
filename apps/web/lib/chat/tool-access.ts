import type { ChatAccountContext } from './account-context';

export function canUsePaidChatTools(
  accountContext: ChatAccountContext
): boolean {
  return (
    accountContext.billingVerification === 'verified' &&
    accountContext.isPro &&
    accountContext.planLimits.booleans.aiCanUseTools
  );
}

export function resolveChatTurnPlanLimits(accountContext: ChatAccountContext) {
  const paidToolAccess = canUsePaidChatTools(accountContext);
  if (paidToolAccess) {
    return accountContext.planLimits;
  }

  return {
    ...accountContext.planLimits,
    booleans: {
      ...accountContext.planLimits.booleans,
      aiCanUseTools: false,
    },
  };
}
