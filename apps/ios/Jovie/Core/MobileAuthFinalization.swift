import Foundation

/**
 * Mobile auth finalization plan (Clerk → Better Auth migration, plan
 * decision 9). Under BA there is exactly one path: the native exchange
 * route returns a freshly minted `ba_sessions` row's `sessionToken` for
 * iOS (independent of the completing browser session — audit row 12). The
 * old `requiresClerkTicketFlow` case is deleted — no Clerk ticket flow.
 */
enum MobileAuthFinalizationPlan: Equatable {
  case completeWithNativeSession(token: String, userID: String, expiresInSeconds: Int)
}

enum MobileAuthFinalizationPlanner {
  static func plan(for exchangeResponse: NativeAuthExchangeResponse) -> MobileAuthFinalizationPlan? {
    if let sessionToken = exchangeResponse.sessionToken,
       let userID = exchangeResponse.userId,
       sessionToken.isEmpty == false,
       userID.isEmpty == false
    {
      return .completeWithNativeSession(
        token: sessionToken,
        userID: userID,
        expiresInSeconds: exchangeResponse.expiresInSeconds
      )
    }

    // Electron's `ticket` field (the OTT) is intentionally not handled
    // here — Electron never calls this planner. Electron's native-complete
    // page consumes the OTT via `completeDesktopNativeAuth`.
    return nil
  }
}
