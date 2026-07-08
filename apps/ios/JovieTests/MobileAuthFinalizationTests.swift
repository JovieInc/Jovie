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

  @Test func planIsNilWhenNeitherSessionTokenNorTicketPresent() {
    let response = NativeAuthExchangeResponse(
      ticket: nil,
      sessionToken: nil,
      sessionId: nil,
      userId: nil,
      returnTo: "/dashboard",
      expiresInSeconds: 0
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == nil)
  }

  @Test func planFallsBackToTicketWhenSessionTokenIsEmptyString() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_fallback",
      sessionToken: "",
      sessionId: nil,
      userId: "user_456",
      returnTo: "/dashboard",
      expiresInSeconds: 3600
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == .requiresClerkTicketFlow(ticket: "ticket_fallback"))
  }

  @Test func planFallsBackToTicketWhenUserIdIsEmptyString() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_fallback",
      sessionToken: "native-session-token",
      sessionId: nil,
      userId: "",
      returnTo: "/dashboard",
      expiresInSeconds: 3600
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == .requiresClerkTicketFlow(ticket: "ticket_fallback"))
  }

  @Test func planIsNilWhenSessionTokenValidButTicketIsEmptyStringAndUserIdMissing() {
    let response = NativeAuthExchangeResponse(
      ticket: "",
      sessionToken: nil,
      sessionId: nil,
      userId: nil,
      returnTo: "/dashboard",
      expiresInSeconds: 0
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == nil)
  }

  @Test func liveLaunchConfigurationUsesMockForNonLiveModes() {
    let result = LiveLaunchConfigurationResolver.resolve(
      launchMode: .uiTestingSignedOut,
      loadLiveConfiguration: {
        AppConfiguration.mock
      },
      loadUnvalidatedConfiguration: {
        testConfiguration()
      }
    )

    #expect(result.shouldConfigureClerk == false)
    #expect(result.authErrorMessage == nil)
  }

  @Test func liveLaunchConfigurationEnablesClerkForValidLiveConfig() {
    let configuration = testConfiguration()

    let result = LiveLaunchConfigurationResolver.resolve(
      launchMode: .live,
      loadLiveConfiguration: { configuration },
      loadUnvalidatedConfiguration: { testConfiguration() }
    )

    #expect(result.shouldConfigureClerk == true)
    #expect(result.authErrorMessage == nil)
  }

  private func testConfiguration() -> AppConfiguration {
    AppConfiguration(
      apiBaseURL: URL(string: "https://jov.ie")!,
      webBaseURL: URL(string: "https://jov.ie")!,
      sentryDSN: nil,
      observabilityIngestURL: nil,
      observabilityIngestSecret: nil,
      observabilityEnvironment: "test",
      clerkCallbackUrlScheme: "ie.jov.jovie"
    )
  }
}
