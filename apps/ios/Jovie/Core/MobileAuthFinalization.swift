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
  case sessionNotPersisted

  var errorDescription: String? {
    switch self {
    case .missingExchangeCredential:
      "The native auth exchange did not return a usable session credential."
    case .sessionNotPersisted:
      "The native session could not be saved. Try signing in again."
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
  } catch is CancellationError {
    throw CancellationError()
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

/// The existing view owns one exchange handle, never profile/terminal work.
/// Matching release also keeps a late A completion from losing B's handle.
@MainActor
struct MobileAuthFinalizationSlot {
  private(set) var attempt: NativeAuthAttempt?
  private(set) var task: Task<Void, Never>?

  mutating func install(_ attempt: NativeAuthAttempt, operation: @escaping @MainActor () async -> Void) {
    let old = task
    self.attempt = attempt
    task = Task { await operation() }
    old?.cancel()
  }

  mutating func release(_ attempt: NativeAuthAttempt) {
    guard self.attempt == attempt else { return }
    self.attempt = nil
    task = nil
  }

  mutating func cancel(_ attempt: NativeAuthAttempt, reconcile: (NativeAuthResolution) -> Void) {
    guard self.attempt == attempt else { return }
    if let result = NativeSessionTokenStore.cancelAuthAttempt(attempt) { reconcile(result) }
    let old = task
    release(attempt)
    old?.cancel()
  }
}

@MainActor
func finalizeMobileAuthAttempt(
  _ attempt: NativeAuthAttempt,
  exchange: () async throws -> NativeAuthExchangeResponse,
  reconcile: (NativeAuthResolution, Error?) -> Task<Void, Never>?,
  failure: (NativeSessionCleanupClaim, Error) -> Task<Void, Never>?,
  settled: (NativeAuthResolution) -> Void
) async {
  func cancel() -> Task<Void, Never>? {
    guard let result = NativeSessionTokenStore.cancelAuthAttempt(attempt) else { return nil }
    return reconcile(result, nil)
  }
  guard !Task.isCancelled else { await cancel()?.value; return }
  guard NativeSessionTokenStore.performIfCurrent(attempt, {}) else { return }
  do {
    let response = try await runMobileAuthFinalizationStage("exchange", operation: exchange)
    guard !Task.isCancelled else { await cancel()?.value; return }
    guard let plan = MobileAuthFinalizationPlanner.plan(for: response) else {
      throw MobileAuthReturnError.missingExchangeCredential
    }
    switch plan {
    case let .completeWithNativeSession(token, userID, expiresInSeconds):
      let session = NativeStoredSession(userID: userID, token: token,
        expiresAt: Date().addingTimeInterval(TimeInterval(expiresInSeconds)))
      if let result = NativeSessionTokenStore.commit(attempt, session: session) {
        // Mandatory synchronous handoff precedes every await/cancellation check.
        let work = reconcile(result, result.outcome == .persisted || result.origin == .cancellation
          ? nil : MobileAuthReturnError.sessionNotPersisted)
        await work?.value
        settled(result)
      } else {
        await cancel()?.value
      }
    }
  } catch {
    if error is CancellationError || Task.isCancelled {
      await cancel()?.value
    } else if let claim = NativeSessionTokenStore.claimCleanup(for: attempt) {
      let work = failure(claim, error)
      await work?.value
    } else if let result = NativeSessionTokenStore.cancelAuthAttempt(attempt) {
      let work = reconcile(result, Task.isCancelled ? nil : error)
      await work?.value
      settled(result)
    }
  }
}

@MainActor
@discardableResult
func presentUnprovenMobileAuthError(
  route: AppRouter, hasFinalizeInFlight: Bool, _ presentation: () -> Void
) -> Bool {
  guard route == .signedOut, !hasFinalizeInFlight else { return false }
  return NativeSessionTokenStore.performIfNoPendingAuth(presentation)
}
