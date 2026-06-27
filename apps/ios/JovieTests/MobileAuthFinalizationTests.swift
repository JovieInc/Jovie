import Foundation
import Testing
@testable import Jovie

@Suite(.serialized)
struct MobileAuthFinalizationTests {
  @Test func sessionTokenPlanSkipsClerkStartup() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_should_be_ignored",
      sessionToken: "native-session-token",
      sessionId: "sess_123",
      userId: "user_456",
      returnTo: "/dashboard",
      expiresInSeconds: 3600
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(
      plan == .completeWithNativeSession(
        token: "native-session-token",
        userID: "user_456",
        expiresInSeconds: 3600
      )
    )
  }

  @Test func ticketPlanRequiresClerkStartup() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_only",
      sessionToken: nil,
      sessionId: nil,
      userId: nil,
      returnTo: "/dashboard",
      expiresInSeconds: 0
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == .requiresClerkTicketFlow(ticket: "ticket_only"))
  }

  @Test func liveLaunchConfigurationUsesMockForNonLiveModes() {
    let result = LiveLaunchConfigurationResolver.resolve(
      launchMode: .uiTestingSignedOut,
      loadLiveConfiguration: {
        throw ClerkPublishableKeyValidationError.developmentKeyInDistribution
      },
      loadUnvalidatedConfiguration: {
        testConfiguration(clerkPublishableKey: "pk_test_fallback")
      }
    )

    #expect(result.configuration.clerkPublishableKey == AppConfiguration.mock.clerkPublishableKey)
    #expect(result.shouldConfigureClerk == false)
    #expect(result.authErrorMessage == nil)
  }

  @Test func liveLaunchConfigurationEnablesClerkForValidLiveConfig() {
    let configuration = testConfiguration(clerkPublishableKey: "pk_live_prod")

    let result = LiveLaunchConfigurationResolver.resolve(
      launchMode: .live,
      loadLiveConfiguration: { configuration },
      loadUnvalidatedConfiguration: {
        testConfiguration(clerkPublishableKey: "pk_test_fallback")
      }
    )

    #expect(result.configuration.clerkPublishableKey == "pk_live_prod")
    #expect(result.shouldConfigureClerk == true)
    #expect(result.authErrorMessage == nil)
  }

  @Test func liveLaunchConfigurationFailsClosedForInvalidDistributionConfig() {
    let fallbackConfiguration = testConfiguration(
      clerkPublishableKey: "pk_test_bW9zdC1rb2FsYS04NC5jbGVyay5hY2NvdW50cy5kZXYk"
    )

    let result = LiveLaunchConfigurationResolver.resolve(
      launchMode: .live,
      loadLiveConfiguration: {
        throw ClerkPublishableKeyValidationError.developmentKeyInDistribution
      },
      loadUnvalidatedConfiguration: { fallbackConfiguration }
    )

    #expect(result.configuration.clerkPublishableKey == fallbackConfiguration.clerkPublishableKey)
    #expect(result.shouldConfigureClerk == false)
    #expect(
      result.authErrorMessage ==
        "Sign-in is unavailable in this build. Install the latest TestFlight build or try again later."
    )
  }

  @Test func rejectsPlaceholderClerkKeyInDistributionBuilds() {
#if DEBUG
    // Development builds may use pk_test keys locally.
#else
    #expect(throws: ClerkPublishableKeyValidationError.placeholder) {
      try ClerkPublishableKeyValidator.validateForDistribution(
        ClerkPublishableKeyValidator.placeholderKey
      )
    }

    #expect(throws: ClerkPublishableKeyValidationError.developmentKeyInDistribution) {
      try ClerkPublishableKeyValidator.validateForDistribution("pk_test_example")
    }

    #expect(throws: ClerkPublishableKeyValidationError.knownDevelopmentInstance) {
      try ClerkPublishableKeyValidator.validateForDistribution(
        "pk_live_most-koala-84.clerk.accounts.dev"
      )
    }
#endif
  }

  @Test func acceptsProductionStyleKeyInDistributionBuilds() throws {
#if DEBUG
    // Validated only for release/TestFlight builds.
#else
    try ClerkPublishableKeyValidator.validateForDistribution(
      "pk_live_production_instance.clerk.accounts.dev"
    )
#endif
  }

  private func testConfiguration(clerkPublishableKey: String) -> AppConfiguration {
    AppConfiguration(
      clerkPublishableKey: clerkPublishableKey,
      apiBaseURL: URL(string: "https://jov.ie")!,
      webBaseURL: URL(string: "https://jov.ie")!,
      sentryDSN: nil,
      observabilityIngestURL: nil,
      observabilityIngestSecret: nil,
      observabilityEnvironment: "test",
      clerkRedirectUrl: "ie.jov.jovie://callback",
      clerkCallbackUrlScheme: "ie.jov.jovie"
    )
  }
}

/// Deterministic guard for the iOS sign-in entry point.
///
/// iOS opens `<webBaseURL>/auth/start` in an `ASWebAuthenticationSession`; the
/// Google/Apple OAuth then happens INSIDE that web session against the web app's
/// Clerk FAPI (clerk.jov.ie) — the same redirect contract the web snapshot tests
/// guard (apps/web/lib/auth/oauth-redirect-uris.expected.json). So the
/// iOS-specific failure mode is the app targeting the WRONG web host/path/scheme
/// (e.g. a stale meetjovie.com, http, or a changed path). This locks that down:
/// if anyone repoints the iOS auth URL, the build fails before it ships.
@Suite struct MobileBrowserAuthURLBuilderGuardTests {
  @Test func signInURLTargetsRegisteredProdHostAndPath() throws {
    let url = try #require(
      MobileBrowserAuthURLBuilder.signInURL(
        baseURL: URL(string: "https://jov.ie")!,
        returnRoute: "/app",
        codeChallenge: "test-code-challenge"
      )
    )
    let components = try #require(
      URLComponents(url: url, resolvingAgainstBaseURL: false)
    )
    #expect(components.scheme == "https")
    #expect(components.host == "jov.ie")
    #expect(components.path == "/auth/start")

    let items = Dictionary(
      uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value) }
    )
    #expect(items["client"] == "ios")
    #expect(items["intent"] == "sign_in")
    #expect(items["return_to"] == "/app")
    #expect(items["code_challenge"] == "test-code-challenge")
    #expect(items["code_challenge_method"] == "S256")
  }

  @Test func signInURLStaysOnConfiguredWebHostOverHTTPS() throws {
    // Whatever host the app is configured with, the auth URL must stay on it and
    // stay HTTPS — never cross-origin to a stale host or drop to http.
    let url = try #require(
      MobileBrowserAuthURLBuilder.signInURL(
        baseURL: URL(string: "https://staging.jov.ie")!,
        codeChallenge: "c"
      )
    )
    #expect(url.scheme == "https")
    #expect(url.host == "staging.jov.ie")
    #expect(url.path == "/auth/start")
  }
}
