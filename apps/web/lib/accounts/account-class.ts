/** Why an account is not a customer. NULL on users.account_class = customer. */
export const ACCOUNT_CLASSES = ['internal', 'test', 'canary', 'agent'] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];
