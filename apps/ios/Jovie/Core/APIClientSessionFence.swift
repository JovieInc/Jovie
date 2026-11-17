/// Session-generation fence for the legacy 401 path (JOV-12807).
///
/// A delayed 401 whose bearer was minted under login A may arrive after a
/// newer login B replaced it. The fence captures the login identity when the
/// request starts and, on 401, only refreshes or clears the session when that
/// identity is still current; a stale 401 is discarded so it cannot sign out
/// the session that replaced it.
enum APIClientSessionFence {
  /// Login identity a request is issued against, with the bearer to send.
  /// Managed authorizations carry their own generation; an unmanaged token
  /// fences on the store generation observed when the request starts.
  static func capture(
    for authorization: NativeRequestAuthorization
  ) -> (token: String, fence: NativeSessionOwnership) {
    (
      authorization.bearerToken,
      authorization.ownership ?? NativeSessionTokenStore.captureOwnership()
    )
  }

  /// Fenced legacy retry: discards a 401 for a replaced login instead of
  /// retrying with the newer login's bearer or clearing its session.
  static func refreshOrDiscard(
    after failedToken: String,
    fence: NativeSessionOwnership,
    provider: TokenProviding
  ) async throws -> String {
    guard NativeSessionTokenStore.isCurrent(fence) else {
      MobileAuthDiagnostics.record("native_session_stale_401_discarded")
      throw APIClientError.requestFailed(statusCode: 401)
    }
    do {
      return try await provider.refreshedBearerToken(after: failedToken)
    } catch APIClientError.missingToken {
      terminalIfCurrent(fence)
      throw APIClientError.missingToken
    }
  }

  /// Fenced terminal clear. The claim captures the session context under one
  /// lock and the completion clears only while that exact context is still
  /// current — `clear()`'s side effects (intent rotation, pending auth and
  /// delivery teardown, storage wipe), refused when a login lands in between.
  /// The fresh capture comparison binds the claim to the request's fence; any
  /// interleaved save either lands before it (fence mismatch, no wipe) or
  /// after it (completion refuses). No storage mutation ever crosses a login.
  static func terminalIfCurrent(_ fence: NativeSessionOwnership) {
    let claim = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
    let context = NativeSessionTokenStore.captureSessionContext()
    guard context.ownership == fence,
          NativeSessionTokenStore.completeCleanup(claim) != nil
    else {
      MobileAuthDiagnostics.record("native_session_stale_401_discarded")
      return
    }
    MobileAuthDiagnostics.record("native_session_cleared_terminal_401")
  }
}
