/** Server-captured binding; app actors and authentication principals are distinct. */
export interface PresenceRemovalPrincipal {
  readonly appActorId: string;
  readonly authUserId: string;
  readonly sessionId: string;
  readonly impersonationSubject: string | null;
}
