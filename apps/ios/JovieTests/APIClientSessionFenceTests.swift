import Foundation
import Testing
@testable import Jovie

/// Race reproduction for the session-generation fence (JOV-12807): a delayed
/// 401 from a replaced login must not clear or retry against the session
/// that replaced it, while a 401 on the current session still terminates or
/// refreshes exactly as before.
private final class FenceMockURLProtocol: URLProtocol {
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

@Suite(.serialized)
struct APIClientSessionFenceTests {
  private func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [FenceMockURLProtocol.self]
    return URLSession(configuration: configuration)
  }

  /// The A→B race: a request starts on session A, session B replaces it
  /// (fresh login, possibly for the same user), then A's 401 arrives late.
  /// The replacement must survive and no retry may use B's bearer for A.
  @Test(arguments: ["user-b", "user-a"])
  func lateUnauthorizedFromAReplacedLoginCannotClearTheReplacement(
    replacementUserID: String
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      var requestCount = 0
      FenceMockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        // Session B replaces A only after A's bearer has been dispatched;
        // A's 401 then arrives late, against the newer login.
        NativeSessionTokenStore.save(token: "login-b", userID: replacementUserID, expiresAt: expiry)
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
          == NativeStoredSession(userID: replacementUserID, token: "login-b", expiresAt: expiry)
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
        _ = try await client.fetchMe()
      }
      #expect(requestCount == 2)
      #expect(
        NativeSessionTokenStore.load()
          == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry)
      )
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
