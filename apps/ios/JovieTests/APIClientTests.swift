import ClerkKit
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
      tokenProvider: tokenProvider
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
}

@MainActor
@Suite(.serialized)
struct ClerkLiveAuthIntegrationTests {
  private static let verificationCode = "424242"

  private struct LiveAuthConfig {
    let publishableKey: String
    let apiBaseURL: URL
    let emailAddress: String
  }

  @Test func exchangesNativeClerkSessionForMobileProfile() async throws {
    guard let config = try liveAuthConfig() else {
      return
    }

    try await configureClerk(with: config)
    try? await Clerk.shared.auth.signOut()

    let initialSignIn = try await Clerk.shared.auth.signInWithEmailCode(
      emailAddress: config.emailAddress
    )
    let completedSignIn = try await initialSignIn.verifyCode(
      Self.verificationCode
    )

    if let sessionID = completedSignIn.createdSessionId,
       Clerk.shared.session?.id != sessionID
    {
      try await Clerk.shared.auth.setActive(sessionId: sessionID)
    }

    let tokenProvider = ClerkTokenProvider()
    let token = try await tokenProvider.bearerToken(forceRefresh: false)
    #expect(token.isEmpty == false)

    let client = APIClient(
      baseURL: config.apiBaseURL,
      tokenProvider: tokenProvider
    )
    let response = try await client.fetchMe()

    #expect(response.continueOnWebURL.isEmpty == false)

    let refreshedToken = try await tokenProvider.bearerToken(forceRefresh: true)
    #expect(refreshedToken.isEmpty == false)
    #expect(
      try await liveMobileMeStatusCode(
        baseURL: config.apiBaseURL,
        token: refreshedToken
      ) == 200
    )
  }

  private func liveAuthConfig() throws -> LiveAuthConfig? {
    let environment = ProcessInfo.processInfo.environment
    guard environment["JOVIE_IOS_LIVE_AUTH"] == "1" else {
      return nil
    }

    let publishableKey =
      environment["CLERK_PUBLISHABLE_KEY"] ??
      environment["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] ??
      ""
    let emailAddress = environment["E2E_CLERK_USER_USERNAME"] ?? ""
    let apiBaseURLString =
      environment["JOVIE_IOS_API_BASE_URL"] ??
      environment["API_BASE_URL"] ??
      "http://localhost:3100"

    guard !publishableKey.isEmpty else {
      throw LiveAuthConfigurationError.missingPublishableKey
    }

    guard !emailAddress.isEmpty else {
      throw LiveAuthConfigurationError.missingEmailAddress
    }

    guard let apiBaseURL = URL(string: apiBaseURLString) else {
      throw LiveAuthConfigurationError.invalidAPIBaseURL(apiBaseURLString)
    }

    return LiveAuthConfig(
      publishableKey: publishableKey,
      apiBaseURL: apiBaseURL,
      emailAddress: emailAddress
    )
  }

  private func configureClerk(with config: LiveAuthConfig) async throws {
    Clerk.configure(
      publishableKey: config.publishableKey,
      options: Clerk.Options(
        keychainConfig: .init(service: "ie.jov.Jovie"),
        redirectConfig: .init(
          redirectUrl: "ie.jov.Jovie://callback",
          callbackUrlScheme: "ie.jov.Jovie"
        )
      )
    )

    _ = try await Clerk.shared.refreshEnvironment()
    _ = try await Clerk.shared.refreshClient()
  }

  private func liveMobileMeStatusCode(baseURL: URL, token: String) async throws -> Int {
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/me"))
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (_, response) = try await URLSession.shared.data(for: request)
    let httpResponse = try #require(response as? HTTPURLResponse)
    return httpResponse.statusCode
  }
}

private enum LiveAuthConfigurationError: Error, Equatable, LocalizedError {
  case invalidAPIBaseURL(String)
  case missingEmailAddress
  case missingPublishableKey

  var errorDescription: String? {
    switch self {
    case let .invalidAPIBaseURL(value):
      return "Invalid API base URL: \(value)"
    case .missingEmailAddress:
      return "Missing E2E_CLERK_USER_USERNAME for live auth integration."
    case .missingPublishableKey:
      return "Missing Clerk publishable key for live auth integration."
    }
  }
}
