import Foundation
import Testing
@testable import Jovie

private actor MockTokenProvider: TokenProviding {
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

private final class MockURLProtocol: URLProtocol {
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

private func requestBodyData(_ request: URLRequest) throws -> Data {
  if let body = request.httpBody {
    return body
  }
  guard let stream = request.httpBodyStream else {
    throw APIClientError.invalidResponse
  }

  stream.open()
  defer { stream.close() }
  var data = Data()
  var buffer = [UInt8](repeating: 0, count: 1_024)
  while stream.hasBytesAvailable {
    let count = stream.read(&buffer, maxLength: buffer.count)
    if count < 0 {
      throw stream.streamError ?? APIClientError.invalidResponse
    }
    if count == 0 { break }
    data.append(contentsOf: buffer.prefix(count))
  }
  return data
}

@Suite(.serialized)
struct APIClientTests {
  private func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: configuration)
  }

  @Test func injectsBearerToken() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      #expect(request.timeoutInterval == 12)
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: nil
      )!
      let data = try JSONEncoder().encode(MobileMeResponse.previewReady)
      return (response, data)
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider,
      requestTimeout: 12
    )

    let response = try await client.fetchMe()

    #expect(response.state == .ready)
    #expect(await tokenProvider.recordedForceRefreshValues() == [false])
  }

  @Test func retriesWithFreshTokenAfterUnauthorized() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["stale-token", "fresh-token"])
    var requestCount = 0

    MockURLProtocol.requestHandler = { request in
      requestCount += 1
      let statusCode = requestCount == 1 ? 401 : 200
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: statusCode,
        httpVersion: nil,
        headerFields: nil
      )!

      if statusCode == 401 {
        return (response, Data())
      }

      let data = try JSONEncoder().encode(MobileMeResponse.previewReady)
      return (response, data)
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    let response = try await client.fetchMe()

    #expect(response.state == .ready)
    #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
  }

  @Test func fetchMeDoesNotRetryUnauthorizedWhenTokenCannotRefresh() async throws {
    try await NativeSessionTokenStoreTestLock.shared.withExclusive {
      NativeSessionTokenStore.clear()
      defer { NativeSessionTokenStore.clear() }
      NativeSessionTokenStore.save(
        token: "stale-native-token",
        userID: "user_401",
        expiresAt: Date().addingTimeInterval(60 * 60)
      )
      #expect(NativeSessionTokenStore.load()?.token == "stale-native-token")

      var requestCount = 0
      MockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-native-token")
        let response = HTTPURLResponse(
          url: request.url!,
          statusCode: 401,
          httpVersion: nil,
          headerFields: nil
        )!
        return (response, Data())
      }

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

  @Test func completesProfileWithBearerAuthenticatedJSON() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/profile/complete")
      #expect(request.httpMethod == "POST")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")

      let body = try requestBodyData(request)
      let payload = try #require(
        JSONSerialization.jsonObject(with: body) as? [String: String]
      )
      #expect(payload == ["displayName": "Tim White", "username": "tim"])

      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: nil
      )!
      return (response, Data(#"{"profileId":"profile-1"}"#.utf8))
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    try await client.completeProfile(displayName: "Tim White", username: "tim")
    #expect(await tokenProvider.recordedForceRefreshValues() == [false])
  }

  @Test func surfacesProfileCompletionConflictMessage() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 409,
        httpVersion: nil,
        headerFields: nil
      )!
      return (
        response,
        Data(#"{"code":"handle_taken","error":"That handle is already taken."}"#.utf8)
      )
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    await #expect(
      throws: APIClientError.profileCompletionFailed(
        statusCode: 409,
        message: "That handle is already taken."
      )
    ) {
      try await client.completeProfile(displayName: "Tim White", username: "tim")
    }
  }

  @Test func surfacesTerminalProfileCompletionUnauthorizedAfterRefresh() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["stale-token", "fresh-token"])
    MockURLProtocol.requestHandler = { request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 401,
        httpVersion: nil,
        headerFields: nil
      )!
      return (response, Data())
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
      try await client.completeProfile(displayName: "Tim White", username: "tim")
    }
    #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
  }

  @Test func fetchesActionLoopInboxWithBearerToken() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/inbox")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: nil
      )!
      let data = try JSONEncoder().encode(MobileActionLoopInboxResponse.preview)
      return (response, data)
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    let response = try await client.fetchActionLoopInbox()

    #expect(response.pendingCount == 1)
    #expect(response.items.count == 1)
  }

  @Test func fetchesActionLoopCalendarWithBearerToken() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/calendar")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: nil
      )!
      let data = try JSONEncoder().encode(MobileActionLoopCalendarResponse.preview)
      return (response, data)
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    let response = try await client.fetchActionLoopCalendar()

    #expect(response.pendingReviewCount == 1)
    #expect(response.upcomingReleases.count == 1)
  }

  @Test func fetchesAudienceHighlightsWithBearerToken() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/audience/highlights")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: nil
      )!
      let data = try JSONEncoder().encode(MobileAudienceHighlightsResponse.preview)
      return (response, data)
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    let response = try await client.fetchAudienceHighlights()

    #expect(response.heroValue == 1284)
    #expect(response.statTiles.count == 4)
  }

  @Test func fetchesAppleWalletPassWithFreshTokenAfterUnauthorized() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["stale-token", "fresh-token"])
    let passData = Data([0x50, 0x4B, 0x03, 0x04])
    var requestCount = 0

    MockURLProtocol.requestHandler = { request in
      requestCount += 1
      #expect(request.url?.path == "/api/wallet/apple/profile-pass")
      #expect(request.value(forHTTPHeaderField: "Accept") == "application/vnd.apple.pkpass")
      #expect(
        request.value(forHTTPHeaderField: "Authorization")
          == "Bearer \(requestCount == 1 ? "stale-token" : "fresh-token")"
      )

      let statusCode = requestCount == 1 ? 401 : 200
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: statusCode,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/vnd.apple.pkpass"]
      )!

      return (response, statusCode == 401 ? Data() : passData)
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    let data = try await client.fetchAppleWalletProfilePass()

    #expect(data == passData)
    #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
  }

  @Test func mapsInvalidJSONToDecodingFailed() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: nil
      )!

      return (response, Data("{".utf8))
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    await #expect(throws: APIClientError.decodingFailed) {
      _ = try await client.fetchMe()
    }
  }

  @Test func nativeSessionRevokerUsesCanonicalBetterAuthSignOut() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["native-token"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/auth/sign-out")
      #expect(request.httpMethod == "POST")
      #expect(request.httpBody == nil)
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer native-token")
      #expect(request.timeoutInterval == 4)

      return (
        HTTPURLResponse(
          url: request.url!,
          statusCode: 200,
          httpVersion: nil,
          headerFields: nil
        )!,
        Data("{\"success\":true}".utf8)
      )
    }

    let revoker = NativeSessionRevoker(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider,
      requestTimeout: 4
    )

    #expect(await revoker.revokeCurrentSession() == .revoked)
    #expect(await tokenProvider.recordedForceRefreshValues() == [false])
  }

  @Test func nativeSessionRevokerReportsServerFailureWithoutRetrying() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["native-token"])
    MockURLProtocol.requestHandler = { request in
      (
        HTTPURLResponse(
          url: request.url!,
          statusCode: 503,
          httpVersion: nil,
          headerFields: nil
        )!,
        Data()
      )
    }

    let revoker = NativeSessionRevoker(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    #expect(await revoker.revokeCurrentSession() == .failed(statusCode: 503))
    #expect(await tokenProvider.recordedForceRefreshValues() == [false])
  }
}
