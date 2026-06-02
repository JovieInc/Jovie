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
      observabilityEnvironment: "test",
      clerkRedirectUrl: "ie.jov.jovie://callback",
      clerkCallbackUrlScheme: "ie.jov.jovie"
    )
  }
}
