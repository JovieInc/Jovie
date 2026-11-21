import Foundation
import Testing
@testable import Jovie

/// Race reproduction for the session-generation fence (JOV-12807): a delayed
/// 401 from a replaced login must not clear or retry against the session
/// that replaced it, while a 401 on the current session still terminates or
/// refreshes exactly as before.
private final class FenceMockURLProtocol: URLProtocol, @unchecked Sendable {
  static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    guard let handler = Self.requestHandler else {
      return
    }

    do {
      let (response, data) = try handler(request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private actor FenceMockTokenProvider: TokenProviding {
  private var forceRefreshValues: [Bool] = []
  private let tokens: [String]

  init(tokens: [String]) {
    self.tokens = tokens
  }

  func bearerToken(forceRefresh: Bool) async throws -> String {
    forceRefreshValues.append(forceRefresh)
    let index = min(forceRefreshValues.count - 1, tokens.count - 1)
    return tokens[index]
  }

  func recordedForceRefreshValues() -> [Bool] {
    forceRefreshValues
  }
}

/// Suspends during force-refresh so tests can install a replacement login
/// between the pre-await fence check and the post-await re-check.
private actor SuspendableRefreshTokenProvider: TokenProviding {
  private var forceRefreshValues: [Bool] = []
  private var refreshContinuation: CheckedContinuation<Void, Never>?
  private let initialToken: String
  private let refreshToken: String

  init(initialToken: String, refreshToken: String) {
    self.initialToken = initialToken
    self.refreshToken = refreshToken
  }

  func bearerToken(forceRefresh: Bool) async throws -> String {
    forceRefreshValues.append(forceRefresh)
    if forceRefresh {
      await withCheckedContinuation { continuation in
        refreshContinuation = continuation
      }
      return refreshToken
    }
    return initialToken
  }

  func resumeRefresh() {
    refreshContinuation?.resume()
    refreshContinuation = nil
  }

  func waitUntilRefreshSuspended() async {
    while refreshContinuation == nil {
      await Task.yield()
    }
  }

  func recordedForceRefreshValues() -> [Bool] {
    forceRefreshValues
  }
}

private enum FenceLegacySurface: String, CaseIterable, Sendable {
  case me
  case audience
  case inbox
  case calendar
  case wallet
  case summerDecision

  var expectedPathSuffix: String {
    switch self {
    case .me: return "/api/mobile/v1/me"
    case .audience: return "/api/mobile/v1/audience/highlights"
    case .inbox: return "/api/mobile/v1/inbox"
    case .calendar: return "/api/mobile/v1/calendar"
    case .wallet: return "/api/wallet/apple/profile-pass"
    case .summerDecision: return "/api/ovie/summer-cards/card-fence/decision"
    }
  }
}

@Suite(.serialized)
struct APIClientSessionFenceTests {
  private func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [FenceMockURLProtocol.self]
    return URLSession(configuration: configuration)
  }

  private func perform(
    _ surface: FenceLegacySurface,
    on client: APIClient
  ) async throws {
    switch surface {
    case .me:
      _ = try await client.fetchMe()
    case .audience:
      _ = try await client.fetchAudienceHighlights()
    case .inbox:
      _ = try await client.fetchActionLoopInbox()
    case .calendar:
      _ = try await client.fetchActionLoopCalendar()
    case .wallet:
      _ = try await client.fetchAppleWalletProfilePass()
    case .summerDecision:
      _ = try await client.decideSummerCard(
        cardID: "card-fence",
        decision: .approve,
        comment: nil
      )
    }
  }

  /// The A→B race: a request starts on session A, session B replaces it
  /// (fresh login, possibly for the same user), then A's 401 arrives late.
  /// The replacement must survive and no retry may use B's bearer for A.
  @Test(arguments: FenceLegacySurface.allCases)
  func lateUnauthorizedFromAReplacedLoginCannotClearTheReplacement(
    surface: FenceLegacySurface
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.url?.absoluteString.contains(surface.expectedPathSuffix) == true)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        // Session B replaces A only after A's bearer has been dispatched;
        // A's 401 then arrives late, against the newer login.
        NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )

      await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
        try await perform(surface, on: client)
      }
      #expect(requestCount == 1)
      #expect(
        NativeSessionTokenStore.load()
          == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry)
      )
    }
  }

  /// Same-user replacement login also survives a delayed A 401.
  @Test func sameUserReplacementLoginSurvivesLateUnauthorized() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        NativeSessionTokenStore.save(token: "login-a2", userID: "user-a", expiresAt: expiry)
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )

      await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
        _ = try await client.fetchMe()
      }
      #expect(requestCount == 1)
      #expect(
        NativeSessionTokenStore.load()
          == NativeStoredSession(userID: "user-a", token: "login-a2", expiresAt: expiry)
      )
    }
  }

  /// Same race through an unmanaged provider: the stale 401 is discarded
  /// without a retry or terminal clear, so session B survives untouched.
  @Test func unmanagedLateUnauthorizedFromAReplacedLoginCannotClearTheReplacement() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let tokenProvider = FenceMockTokenProvider(tokens: ["request-a"])
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: tokenProvider
      )

      await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
        _ = try await client.fetchMe()
      }
      #expect(requestCount == 1)
      #expect(await tokenProvider.recordedForceRefreshValues() == [false])
      #expect(
        NativeSessionTokenStore.load()
          == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry)
      )
    }
  }

  /// A 401 for a token minted from a login replaced while the retried request
  /// is in flight is discarded at the terminal leg instead of clearing B.
  @Test func unauthorizedRetryRacingAReplacedLoginCannotClearTheReplacement() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let tokenProvider = FenceMockTokenProvider(tokens: ["request-a", "retry-token"])
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        if requestCount == 1 {
          #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
          return Self.unauthorized(request)
        }
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer retry-token")
        NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: tokenProvider
      )

      await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
        _ = try await client.fetchAudienceHighlights()
      }
      #expect(requestCount == 2)
      #expect(
        NativeSessionTokenStore.load()
          == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry)
      )
    }
  }

  /// Refresh suspended between fence checks: B installed during await must not
  /// become the retry owner or be cleared by A's terminal path.
  @Test func refreshSuspensionCannotAdoptReplacementLoginAsRetryOwner() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let tokenProvider = SuspendableRefreshTokenProvider(
        initialToken: "request-a", refreshToken: "retry-token"
      )
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: tokenProvider
      )

      async let result: Void = {
        await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
          _ = try await client.fetchActionLoopInbox()
        }
      }()

      await tokenProvider.waitUntilRefreshSuspended()
      NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
      await tokenProvider.resumeRefresh()
      await result

      #expect(requestCount == 1)
      #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
      #expect(
        NativeSessionTokenStore.load()
          == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry)
      )
    }
  }

  /// Same-login bearer rotation advances revision; a delayed 401 for the old
  /// revision must discard instead of clearing the rotated session.
  @Test func lateUnauthorizedAfterSameLoginBearerRotationCannotClearRotatedSession() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let authorization = try #require(NativeSessionTokenStore.requestAuthorization())
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        let roll = HTTPURLResponse(
          url: request.url!, statusCode: 200, httpVersion: nil,
          headerFields: ["set-auth-token": "rotated-a"]
        )!
        NativeSessionTokenStore.refresh(from: roll, authorizedBy: authorization)
        #expect(NativeSessionTokenStore.load()?.token == "rotated-a")
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )

      await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
        _ = try await client.fetchActionLoopCalendar()
      }
      #expect(requestCount == 1)
      #expect(NativeSessionTokenStore.load()?.token == "rotated-a")
      #expect(NativeSessionTokenStore.load()?.userID == "user-a")
    }
  }

  /// The fence must not over-block: a 401 against the still-current session
  /// terminates exactly as before.
  @Test func unauthorizedOnTheCurrentSessionStillTerminates() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "current-a", userID: "user-a", expiresAt: expiry)
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer current-a")
        return Self.unauthorized(request)
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )

      await #expect(throws: APIClientError.missingToken) {
        _ = try await client.fetchMe()
      }
      #expect(requestCount == 1)
      #expect(NativeSessionTokenStore.load() == nil)
    }
  }

  /// The fence must not over-block: a 401 against the still-current session
  /// with a provider that can mint a different token still refreshes and
  /// retries, leaving the stored session untouched.
  @Test func unauthorizedOnTheCurrentSessionStillRefreshesAndRetries() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let storedBeforeRequest = try #require(NativeSessionTokenStore.load())
      let tokenProvider = FenceMockTokenProvider(tokens: ["request-a", "retry-token"])
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        let unauthorized = requestCount == 1
        #expect(
          request.value(forHTTPHeaderField: "Authorization")
            == (unauthorized ? "Bearer request-a" : "Bearer retry-token")
        )
        let data = unauthorized ? Data() : try JSONEncoder().encode(MobileMeResponse.previewReady)
        return (
          HTTPURLResponse(
            url: request.url!, statusCode: unauthorized ? 401 : 200, httpVersion: nil,
            headerFields: nil
          )!,
          data
        )
      }
      defer { FenceMockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: tokenProvider
      )

      let response = try await client.fetchMe()
      #expect(response.state == .ready)
      #expect(requestCount == 2)
      #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
      #expect(NativeSessionTokenStore.load() == storedBeforeRequest)
    }
  }

  private static func unauthorized(_ request: URLRequest) -> (HTTPURLResponse, Data) {
    (
      HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!,
      Data()
    )
  }
}
