import Foundation

/**
 * Better Auth mobile finalization has exactly one path: the native exchange
 * route returns a freshly minted `ba_sessions` row's `sessionToken` for
 * iOS (independent of the completing browser session — audit row 12). The
 */
enum MobileAuthFinalizationPlan: Equatable {
  case completeWithNativeSession(token: String, userID: String, expiresInSeconds: Int)
}

enum MobileAuthReturnError: LocalizedError {
  case missingExchangeCredential

  var errorDescription: String? {
    switch self {
    case .missingExchangeCredential:
      "The native auth exchange did not return a usable session credential."
    }
  }
}

private struct MobileAuthFinalizationStageError: LocalizedError, CustomNSError {
  let stage: String
  let underlyingError: Error

  static let errorDomain = "MobileAuthFinalizationStageError"
  var errorCode: Int { 1 }

  var errorUserInfo: [String: Any] {
    [NSUnderlyingErrorKey: underlyingError as NSError]
  }

  var errorDescription: String? {
    let message = underlyingError.localizedDescription.isEmpty
      ? String(describing: underlyingError)
      : underlyingError.localizedDescription
    return "Native auth \(stage) failed: \(message)"
  }
}

@MainActor
func runMobileAuthFinalizationStage<Value>(
  _ stage: String,
  operation: () async throws -> Value
) async throws -> Value {
  do {
    return try await operation()
  } catch {
    throw MobileAuthFinalizationStageError(
      stage: stage,
      underlyingError: error
    )
  }
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
