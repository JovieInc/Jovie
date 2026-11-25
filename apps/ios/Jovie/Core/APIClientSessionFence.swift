/// Session-generation fence for the legacy 401 path (JOV-12807).
///
/// A delayed 401 whose bearer was minted under login A may arrive after a
/// newer login B replaced it, or after the same login rotated its bearer.
/// The fence captures login identity (and managed bearer revision) when the
/// request starts and, on 401, only refreshes or clears the session when that
/// identity is still current; a stale 401 is discarded so it cannot sign out
/// the session that replaced it.
///
/// Retries keep the original fence — they must not re-capture ownership from
/// whichever login is current after a suspended refresh.
enum APIClientSessionFence {
  /// Login identity a request is issued against, with the bearer to send.
  /// Managed authorizations carry their own generation + revision; an
  /// unmanaged token fences on the store generation observed at start.
  static func capture(
    for authorization: NativeRequestAuthorization
  ) -> (token: String, fence: NativeSessionRequestFence) {
    (authorization.bearerToken, NativeSessionTokenStore.requestFence(for: authorization))
  }

  /// Fenced legacy retry: discards a 401 for a replaced login or rotated
  /// bearer instead of retrying with a newer login's bearer or clearing it.
  /// Returns the refreshed token paired with the **original** fence so the
  /// retry leg cannot adopt a replacement login that lands during the await.
  static func refreshOrDiscard(
    after failedToken: String,
    fence: NativeSessionRequestFence,
    provider: TokenProviding
  ) async throws -> (token: String, fence: NativeSessionRequestFence) {
    guard NativeSessionTokenStore.isCurrent(fence) else {
      MobileAuthDiagnostics.record("native_session_stale_401_discarded")
      throw APIClientError.requestFailed(statusCode: 401)
    }
    do {
      let refreshed = try await provider.refreshedBearerToken(after: failedToken)
      // Login B or a bearer rotation may have landed while refresh was suspended.
      guard NativeSessionTokenStore.isCurrent(fence) else {
        MobileAuthDiagnostics.record("native_session_stale_401_discarded")
        throw APIClientError.requestFailed(statusCode: 401)
      }
      return (refreshed, fence)
    } catch APIClientError.missingToken {
      terminalIfCurrent(fence)
      throw APIClientError.missingToken
    }
  }

  /// Fenced terminal clear. Storage mutations (intent rotation, pending auth /
  /// delivery teardown, wipe) happen only while the request fence is still
  /// current — atomically, so a login that lands between check and clear
  /// cannot have its auth intent rotated by a stale 401.
  static func terminalIfCurrent(_ fence: NativeSessionRequestFence) {
    if NativeSessionTokenStore.clearIfCurrent(fence) {
      MobileAuthDiagnostics.record("native_session_cleared_terminal_401")
    } else {
      MobileAuthDiagnostics.record("native_session_stale_401_discarded")
    }
  }
}
