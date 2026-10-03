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

  enum ResponseRefreshOperation: CaseIterable, Sendable {
    case me, profile, registerPush, unregisterPush, wallet, audience, inbox, calendar
    case summerDecision, summerAlreadyDecided

    var path: String {
      switch self {
      case .me: return "/api/mobile/v1/me"
      case .profile: return "/api/mobile/v1/profile/complete"
      case .registerPush, .unregisterPush: return "/api/mobile/v1/push-devices"
      case .wallet: return "/api/wallet/apple/profile-pass"
      case .audience: return "/api/mobile/v1/audience/highlights"
      case .inbox: return "/api/mobile/v1/inbox"
      case .calendar: return "/api/mobile/v1/calendar"
      case .summerDecision, .summerAlreadyDecided:
        return "/api/ovie/summer-cards/sc_0123456789abcdef0123456789abcdef/decision"
      }
    }

    var method: String {
      switch self {
      case .registerPush: return "PUT"
      case .unregisterPush: return "DELETE"
      case .profile, .summerDecision, .summerAlreadyDecided: return "POST"
      default: return "GET"
      }
    }

    var statusCode: Int {
      switch self {
      case .registerPush, .unregisterPush: return 204
      case .summerAlreadyDecided: return 409
      default: return 200
      }
    }

    func responseData() throws -> Data {
      switch self {
      case .me: return try JSONEncoder().encode(MobileMeResponse.previewReady)
      case .profile: return Data(#"{"profileId":"profile-1"}"#.utf8)
      case .registerPush, .unregisterPush: return Data()
      case .wallet: return Data([0x50, 0x4B, 0x03, 0x04])
      case .audience: return try JSONEncoder().encode(MobileAudienceHighlightsResponse.preview)
      case .inbox: return try JSONEncoder().encode(MobileActionLoopInboxResponse.preview)
      case .calendar: return try JSONEncoder().encode(MobileActionLoopCalendarResponse.preview)
      case .summerDecision, .summerAlreadyDecided: return Data("{}".utf8)
      }
    }

    func assertSuccessfulResponse(from client: APIClient) async throws {
      switch self {
      case .me:
        #expect(try await client.fetchMe().state == .ready)
      case .profile:
        try await client.completeProfile(displayName: "Tim White", username: "tim")
      case .registerPush:
        try await client.registerPushDevice(
          token: "0123456789abcdef", environment: .sandbox, timezone: "America/Los_Angeles"
        )
      case .unregisterPush:
        try await client.unregisterPushDevice(token: "0123456789abcdef")
      case .wallet:
        #expect(try await client.fetchAppleWalletProfilePass() == Data([0x50, 0x4B, 0x03, 0x04]))
      case .audience:
        let response = try await client.fetchAudienceHighlights()
        #expect(response.heroValue == 1284)
        #expect(response.statTiles.count == 4)
      case .inbox:
        let response = try await client.fetchActionLoopInbox()
        #expect(response.pendingCount == 1)
        #expect(response.items.count == 1)
      case .calendar:
        let response = try await client.fetchActionLoopCalendar()
        #expect(response.pendingReviewCount == 1)
        #expect(response.upcomingReleases.count == 1)
      case .summerDecision, .summerAlreadyDecided:
        let response = try await client.decideSummerCard(
          cardID: "sc_0123456789abcdef0123456789abcdef", decision: .approve, comment: nil
        )
        #expect(response == (self == .summerAlreadyDecided ? .alreadyDecided : .decided))
      }
    }
  }

  @Test(arguments: ResponseRefreshOperation.allCases, [false, true])
  func responseHeaderOnlyRefreshesTheDispatchedSession(
    operation: ResponseRefreshOperation,
    replaceSessionBeforeResponse: Bool
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let dispatchedAuthorization = try #require(NativeSessionTokenStore.requestAuthorization())
      var replacementAuthorization: NativeRequestAuthorization?
      var requestCount = 0
      let responseData = try operation.responseData()
      MockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.url?.path == operation.path)
        #expect(request.httpMethod == operation.method)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        // Install B only after A's bearer has actually been dispatched.
        if replaceSessionBeforeResponse {
          NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
          replacementAuthorization = try #require(NativeSessionTokenStore.requestAuthorization())
        }
        return (
          HTTPURLResponse(
            url: request.url!, statusCode: operation.statusCode, httpVersion: nil,
            headerFields: ["set-auth-token": "rolled-a"]
          )!,
          responseData
        )
      }
      defer { MockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )
      try await operation.assertSuccessfulResponse(from: client)

      #expect(requestCount == 1)
      let stored = try #require(NativeSessionTokenStore.load())
      let authorization = try #require(NativeSessionTokenStore.requestAuthorization())
      if replaceSessionBeforeResponse {
        #expect(stored == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry))
        #expect(authorization == (try #require(replacementAuthorization)))
      } else {
        #expect(stored.userID == "user-a")
        #expect(stored.token == "rolled-a")
        #expect(stored.expiresAt > expiry)
        #expect(authorization.bearerToken == "rolled-a")
        #expect(authorization != dispatchedAuthorization)
      }
    }
  }

  @Test(arguments: ResponseRefreshOperation.allCases, [false, true])
  func unmanagedSuccessAndRetryCannotRefreshTheStoredSession(
    operation: ResponseRefreshOperation,
    retryAfterUnauthorized: Bool
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      // Matching the stored bearer does not grant an unmanaged provider write authority.
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let storedBeforeRequest = try #require(NativeSessionTokenStore.load())
      let authorizationBeforeRequest = try #require(NativeSessionTokenStore.requestAuthorization())
      let tokenProvider = MockTokenProvider(tokens: ["request-a", "retry-token"])
      let responseData = try operation.responseData()
      var requestCount = 0
      MockURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.url?.path == operation.path)
        #expect(request.httpMethod == operation.method)
        #expect(
          request.value(forHTTPHeaderField: "Authorization")
            == (requestCount == 1 ? "Bearer request-a" : "Bearer retry-token")
        )
        #expect(NativeSessionTokenStore.load() == storedBeforeRequest)
        #expect(NativeSessionTokenStore.requestAuthorization() == authorizationBeforeRequest)
        let unauthorized = retryAfterUnauthorized && requestCount == 1
        return (
          HTTPURLResponse(
            url: request.url!, statusCode: unauthorized ? 401 : operation.statusCode, httpVersion: nil,
            headerFields: ["set-auth-token": "unmanaged-roll"]
          )!,
          unauthorized ? Data() : responseData
        )
      }
      defer { MockURLProtocol.requestHandler = nil }

      let client = APIClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: tokenProvider
      )
      try await operation.assertSuccessfulResponse(from: client)

      #expect(requestCount == (retryAfterUnauthorized ? 2 : 1))
      #expect(
        await tokenProvider.recordedForceRefreshValues()
          == (retryAfterUnauthorized ? [false, true] : [false])
      )
      #expect(NativeSessionTokenStore.load() == storedBeforeRequest)
      #expect(NativeSessionTokenStore.requestAuthorization() == authorizationBeforeRequest)
    }
  }

  enum PinnedPushOperation: CaseIterable, Sendable {
    case register, unregister

    var method: String { self == .register ? "PUT" : "DELETE" }

    var payload: [String: String] {
      if self == .register {
        return [
          "token": "0123456789abcdef",
          "environment": "sandbox",
          "timezone": "America/Los_Angeles",
        ]
      }
      return ["token": "0123456789abcdef"]
    }

    func perform(on client: APIClient, authorization: NativeRequestAuthorization) async throws {
      switch self {
      case .register:
        try await client.registerPushDevice(
          token: "0123456789abcdef", environment: .sandbox, timezone: "America/Los_Angeles",
          authorization: authorization
        )
      case .unregister:
        try await client.unregisterPushDevice(token: "0123456789abcdef", authorization: authorization)
      }
    }
  }

  @Test func pushOwnershipAllowsRotationButNotReloginOrSignedOutAdoption() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date().addingTimeInterval(3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let initial = NativeSessionTokenStore.captureSessionContext()
      let authorization = try #require(initial.authorization)
      let response = HTTPURLResponse(
        url: URL(string: "https://jov.ie/api/mobile/v1/push-devices")!,
        statusCode: 204, httpVersion: nil, headerFields: ["set-auth-token": "rotated-a"]
      )!
      NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
      #expect(NativeSessionTokenStore.isCurrent(initial.ownership))
      #expect(
        NativeSessionTokenStore.requestAuthorization(ifOwnedBy: initial.ownership)?.bearerToken == "rotated-a"
      )

      NativeSessionTokenStore.save(token: "rotated-a", userID: "user-a", expiresAt: expiry)
      #expect(!NativeSessionTokenStore.isCurrent(initial.ownership))
      #expect(NativeSessionTokenStore.requestAuthorization(ifOwnedBy: initial.ownership) == nil)
      NativeSessionTokenStore.clear()
      let signedOut = NativeSessionTokenStore.captureSessionContext()
      #expect(signedOut.authorization == nil)
      #expect(NativeSessionTokenStore.isCurrent(signedOut.ownership))
      NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
      #expect(!NativeSessionTokenStore.isCurrent(signedOut.ownership))
      #expect(NativeSessionTokenStore.requestAuthorization(ifOwnedBy: signedOut.ownership) == nil)
    }
  }

  @Test(arguments: PinnedPushOperation.allCases, [204, 401])
  func pinnedPushRequestsKeepTheirAuthorizationWithoutRetryOrGlobalClear(
    operation: PinnedPushOperation,
    statusCode: Int
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      // Same-user replacement also reuses the bearer, exercising login-generation ABA.
      let replacementUserIDs: [String?] = [nil, "user-b", "user-a"]
      for replacementUserID in replacementUserIDs {
        let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
        NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
        let dispatchedAuthorization = try #require(NativeSessionTokenStore.requestAuthorization())
        var expectedStored = try #require(NativeSessionTokenStore.load())
        var expectedAuthorization = dispatchedAuthorization
        var requestCount = 0
        let tokenProvider = MockTokenProvider(tokens: ["must-not-be-used", "must-not-refresh"])
        MockURLProtocol.requestHandler = { request in
          requestCount += 1
          #expect(request.url?.path == "/api/mobile/v1/push-devices")
          #expect(request.httpMethod == operation.method)
          #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
          #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
          let payload = try #require(
            JSONSerialization.jsonObject(with: requestBodyData(request)) as? [String: String]
          )
          #expect(payload == operation.payload)
          // Only install B after observing A's actual dispatched credential.
          if let replacementUserID {
            NativeSessionTokenStore.save(
              token: replacementUserID == "user-a" ? "request-a" : "login-b",
              userID: replacementUserID,
              expiresAt: expiry
            )
            expectedStored = try #require(NativeSessionTokenStore.load())
            expectedAuthorization = try #require(NativeSessionTokenStore.requestAuthorization())
          }
          return (
            HTTPURLResponse(
              url: request.url!, statusCode: statusCode, httpVersion: nil,
              headerFields: ["set-auth-token": "rolled-a"]
            )!,
            Data()
          )
        }
        defer { MockURLProtocol.requestHandler = nil }
        let client = APIClient(
          baseURL: URL(string: "https://jov.ie")!, session: makeSession(), tokenProvider: tokenProvider
        )

        if statusCode == 401 {
          await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
            try await operation.perform(on: client, authorization: dispatchedAuthorization)
          }
        } else {
          try await operation.perform(on: client, authorization: dispatchedAuthorization)
        }

        #expect(requestCount == 1)
        #expect(await tokenProvider.recordedForceRefreshValues().isEmpty)
        let stored = try #require(NativeSessionTokenStore.load())
        let authorization = try #require(NativeSessionTokenStore.requestAuthorization())
        if replacementUserID == nil, statusCode == 204 {
          #expect(stored.userID == "user-a")
          #expect(stored.token == "rolled-a")
          #expect(stored.expiresAt > expiry)
          #expect(authorization.bearerToken == "rolled-a")
          #expect(authorization != dispatchedAuthorization)
        } else {
          #expect(stored == expectedStored)
          #expect(authorization == expectedAuthorization)
        }
      }
    }
  }

  @Test func injectsBearerToken() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      #expect(
        request.value(forHTTPHeaderField: "X-Jovie-Mobile-Capabilities")
          == "waitlist_pending"
      )
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

  @Test func registersPushDeviceWithAuthenticatedJSON() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/push-devices")
      #expect(request.httpMethod == "PUT")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      let body = try requestBodyData(request)
      let payload = try #require(
        JSONSerialization.jsonObject(with: body) as? [String: String]
      )
      #expect(payload == [
        "environment": "sandbox",
        "timezone": "America/Los_Angeles",
        "token": "0123456789abcdef",
      ])
      return (
        HTTPURLResponse(
          url: request.url!,
          statusCode: 204,
          httpVersion: nil,
          headerFields: nil
        )!,
        Data()
      )
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    try await client.registerPushDevice(
      token: "0123456789abcdef",
      environment: .sandbox,
      timezone: "America/Los_Angeles"
    )
    #expect(await tokenProvider.recordedForceRefreshValues() == [false])
  }

  @Test func unregistersPushDeviceWithAuthenticatedJSON() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/push-devices")
      #expect(request.httpMethod == "DELETE")
      let body = try requestBodyData(request)
      let payload = try #require(
        JSONSerialization.jsonObject(with: body) as? [String: String]
      )
      #expect(payload == ["token": "0123456789abcdef"])
      return (
        HTTPURLResponse(
          url: request.url!,
          statusCode: 204,
          httpVersion: nil,
          headerFields: nil
        )!,
        Data()
      )
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    try await client.unregisterPushDevice(token: "0123456789abcdef")
  }

  @Test func rendersAPNsDeviceTokenAsLowercaseHex() {
    #expect(
      PushNotificationManager.tokenString(from: Data([0x00, 0x0A, 0xFE, 0xFF]))
        == "000afeff"
    )
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
    try await withNativeSessionTokenStoreTestIsolation {
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

  @Test func fetchesOvieInboxWithWorkspaceQuery() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/mobile/v1/inbox")
      #expect(request.url?.query?.contains("workspace=ov") == true)
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

    _ = try await client.fetchActionLoopInbox(workspace: .ovie)
  }

  @Test func postsSummerCardDecisionAndMapsRepeatToAlreadyDecided() async throws {
    let tokenProvider = MockTokenProvider(tokens: ["token-1"])
    MockURLProtocol.requestHandler = { request in
      #expect(request.url?.path == "/api/ovie/summer-cards/sc_0123456789abcdef0123456789abcdef/decision")
      #expect(request.httpMethod == "POST")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
      let decoded = try JSONDecoder().decode(
        [String: String].self,
        from: requestBodyData(request)
      )
      #expect(decoded["decision"] == "reject")
      #expect(decoded["comment"] == "Too expensive.")
      return (
        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
        Data("{}".utf8)
      )
    }

    let client = APIClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider
    )

    let decided = try await client.decideSummerCard(
      cardID: "sc_0123456789abcdef0123456789abcdef",
      decision: .reject,
      comment: "Too expensive."
    )
    #expect(decided == .decided)

    MockURLProtocol.requestHandler = { request in
      (
        HTTPURLResponse(url: request.url!, statusCode: 409, httpVersion: nil, headerFields: nil)!,
        Data("{}".utf8)
      )
    }
    let repeatResult = try await client.decideSummerCard(
      cardID: "sc_0123456789abcdef0123456789abcdef",
      decision: .approve,
      comment: nil
    )
    #expect(repeatResult == .alreadyDecided)
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

extension APIClientTests {
  @Test(arguments: ["current", "rotation", "same-bearer", "expiry", "save", "clear", "intent"])
  func cleanupClaimFollowsOnlyItsOriginalLifecycle(change: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let original = NativeSessionTokenStore.captureSessionContext()
      let authorization = try #require(original.authorization)
      let claim = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      if change == "rotation" || change == "same-bearer" {
        let response = HTTPURLResponse(url: URL(string: "https://jov.ie")!, statusCode: 200,
          httpVersion: nil, headerFields: ["set-auth-token": change == "rotation" ? "a2" : "a"])!
        NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
      } else if change == "expiry" {
        UserDefaults.standard.set(0, forKey: "ie.jov.Jovie.nativeSession.expiresAt")
        #expect(NativeSessionTokenStore.load() == nil)
      } else if change == "save" {
        NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      } else if change == "clear" {
        NativeSessionTokenStore.clear()
      } else if change == "intent" {
        _ = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      }
      let current = NativeSessionTokenStore.captureSessionContext()
      let valid = !["save", "clear", "intent"].contains(change)
      let requestContext = NativeSessionTokenStore.captureSessionContext(for: claim)
      #expect(requestContext == (valid ? current : nil))
      var mutations = 0
      #expect(NativeSessionTokenStore.performIfCurrent(claim, { _ in mutations += 1 }) == valid)
      #expect(mutations == (valid ? 1 : 0))
      let completion = NativeSessionTokenStore.completeCleanup(claim)
      #expect((completion != nil) == valid)
      if let completion {
        #expect(completion.ownership != current.ownership)
        #expect(NativeSessionTokenStore.captureSessionContext().authorization == nil)
        #expect(!NativeSessionTokenStore.canContinueProfileLoad(ownedBy: original.ownership))
        #expect(NativeSessionTokenStore.performIfCurrent(completion, {}))
      } else {
        #expect(NativeSessionTokenStore.captureSessionContext() == current)
      }
      #expect(NativeSessionTokenStore.completeCleanup(claim) == nil)
      #expect(NativeSessionTokenStore.captureSessionContext(for: claim) == nil)
    }
  }

  @Test func emptyCleanupConsumesOnceAndCompletionRejectsNewIntent() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let before = NativeSessionTokenStore.captureSessionContext()
      let claim = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      #expect(NativeSessionTokenStore.captureSessionContext(for: claim) == before)
      let completion = try #require(NativeSessionTokenStore.completeCleanup(claim))
      #expect(completion.ownership != before.ownership)
      #expect(NativeSessionTokenStore.completeCleanup(claim) == nil)
      #expect(!NativeSessionTokenStore.performIfCurrent(claim, { _ in Issue.record("Consumed claim ran") }))
      let empty = NativeSessionTokenStore.captureSessionContext()
      _ = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      #expect(NativeSessionTokenStore.captureSessionContext() == empty)
      // This is the same atomic completion guard consumed by LiveRoot after its await.
      var didResetRoot = false
      #expect(!NativeSessionTokenStore.performIfCurrent(completion, { didResetRoot = true }))
      #expect(!didResetRoot)
    }
  }

  @Test(arguments: [200, 503], [false, true])
  func pinnedRevocationNeverAcquiresTheProviderOrReplacement(status: Int, empty: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let authorization = try #require(NativeSessionTokenStore.requestAuthorization())
      let provider = MockTokenProvider(tokens: ["provider-b"])
      var requests = 0
      MockURLProtocol.requestHandler = { request in
        requests += 1
        #expect(request.url?.path == "/api/auth/sign-out" && request.httpMethod == "POST")
        #expect(request.httpBody == nil && request.timeoutInterval == 4)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer a")
        NativeSessionTokenStore.save(token: "b", userID: "b", expiresAt: .distantFuture)
        return (HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, Data())
      }
      defer { MockURLProtocol.requestHandler = nil }
      let revoker = NativeSessionRevoker(baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
        tokenProvider: provider, requestTimeout: 4)
      let result = await revoker.revokeSession(authorizedBy: empty ? nil : authorization)
      let expected: NativeSessionRevocationResult = empty ? .noSession : (status == 200 ? .revoked : .failed(statusCode: status))
      #expect(result == expected)
      #expect(requests == (empty ? 0 : 1))
      #expect(await provider.recordedForceRefreshValues().isEmpty)
      #expect(NativeSessionTokenStore.load()?.token == (empty ? "a" : "b"))
    }
  }

  @Test(arguments: ["current", "new-user", "same-login", "clear", "retry-success", "retry-revised", "same-bearer", "cancel"])
  func ownedMeUsesOnlyItsCapturedRequestAuthority(outcome: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let first = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      var requests = 0
      var preserved = NativeSessionTokenStore.captureSessionContext()
      MockURLProtocol.requestHandler = { request in
        requests += 1
        #expect(request.url?.path == "/api/mobile/v1/me")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(requests == 1 ? "t0" : "t1")")
        let response: (Int, String?) -> HTTPURLResponse = { status, token in
          HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                          headerFields: token.map { ["set-auth-token": $0] })!
        }
        if outcome == "cancel" { throw URLError(.cancelled) }
        if requests == 1 {
          switch outcome {
          case "new-user", "same-login":
            NativeSessionTokenStore.save(
              token: outcome == "same-login" ? "t0" : "b",
              userID: outcome == "same-login" ? "a" : "b", expiresAt: .distantFuture
            )
          case "clear": NativeSessionTokenStore.clear()
          case "retry-success", "retry-revised", "same-bearer":
            NativeSessionTokenStore.refresh(
              from: response(200, outcome == "same-bearer" ? "t0" : "t1"), authorizedBy: first
            )
          default: break
          }
        } else if outcome == "retry-success" {
          return (response(200, "t2"), try JSONEncoder().encode(MobileMeResponse.previewReady))
        } else if outcome == "retry-revised" {
          let retry = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
          NativeSessionTokenStore.refresh(from: response(200, "t2"), authorizedBy: retry)
        }
        preserved = NativeSessionTokenStore.captureSessionContext()
        return (response(401, nil), Data())
      }
      defer { MockURLProtocol.requestHandler = nil }
      let client: any APIClientProtocol = APIClient(
        baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )
      if outcome == "retry-success" {
        #expect(try await client.fetchMe(for: "a", ifOwnedBy: owner) == .previewReady)
        #expect(NativeSessionTokenStore.load()?.token == "t2")
        #expect(NativeSessionTokenStore.captureOwnership() == owner)
      } else if outcome == "current" {
        do {
          _ = try await client.fetchMe(for: "a", ifOwnedBy: owner)
          Issue.record("Current rejection must produce its expiry receipt")
        } catch let NativeSessionRequestError.expired(receipt) {
          #expect(receipt.userID == "a")
          #expect(NativeSessionTokenStore.captureOwnership() == receipt.ownership)
          #expect(NativeSessionTokenStore.load() == nil)
        }
      } else if outcome == "cancel" {
        await #expect(throws: CancellationError.self) { try await client.fetchMe(for: "a", ifOwnedBy: owner) }
        #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
      } else {
        await #expect(throws: NativeSessionRequestError.superseded) {
          try await client.fetchMe(for: "a", ifOwnedBy: owner)
        }
        #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
      }
      #expect(requests == (outcome.hasPrefix("retry-") ? 2 : 1))
    }
  }

  @Test(arguments: [false, true])
  func ownedMeCannotAcquireAReplacementBeforeDispatch(sameLogin: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      NativeSessionTokenStore.save(
        token: sameLogin ? "a" : "b", userID: sameLogin ? "a" : "b", expiresAt: .distantFuture
      )
      let replacement = NativeSessionTokenStore.captureSessionContext()
      var requests = 0
      MockURLProtocol.requestHandler = { _ in
        requests += 1
        throw APIClientError.invalidResponse
      }
      defer { MockURLProtocol.requestHandler = nil }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
                             tokenProvider: NativeSessionTokenProvider())
      await #expect(throws: NativeSessionRequestError.superseded) {
        try await client.fetchMe(for: "a", ifOwnedBy: owner)
      }
      #expect(requests == 0)
      #expect(NativeSessionTokenStore.captureSessionContext() == replacement)
    }
  }

  @Test(arguments: [false, true])
  func ownedMeUnmanagedRetryHasNoNativeMutationAuthority(succeed: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: .distantFuture)
      let before = NativeSessionTokenStore.captureSessionContext()
      let provider = MockTokenProvider(tokens: ["t0", "t1"])
      var requests = 0
      MockURLProtocol.requestHandler = { request in
        requests += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(requests == 1 ? "t0" : "t1")")
        let status = requests == 2 && succeed ? 200 : 401
        return (HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                headerFields: ["set-auth-token": "unmanaged-header"])!,
                try JSONEncoder().encode(MobileMeResponse.previewReady))
      }
      defer { MockURLProtocol.requestHandler = nil }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
                             tokenProvider: provider)
      if succeed {
        let response = try await client.fetchMe(for: "a", ifOwnedBy: before.ownership)
        #expect(response == .previewReady)
      } else {
        await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
          try await client.fetchMe(for: "a", ifOwnedBy: before.ownership)
        }
      }
      #expect(requests == 2)
      #expect(await provider.recordedForceRefreshValues() == [false, true])
      #expect(NativeSessionTokenStore.captureSessionContext() == before)
    }
  }
}
