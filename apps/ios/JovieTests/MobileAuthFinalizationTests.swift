import Foundation
import Testing
@testable import Jovie

@Suite(.serialized)
struct MobileAuthFinalizationTests {
  @Test func sessionTokenPlanUsesBetterAuthSession() {
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

  @Test func ticketOnlyPlanIsNilUnderBetterAuth() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_only",
      sessionToken: nil,
      sessionId: nil,
      userId: nil,
      returnTo: "/dashboard",
      expiresInSeconds: 0
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == nil)
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

  @Test func planIsNilWhenSessionTokenIsEmptyString() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_fallback",
      sessionToken: "",
      sessionId: nil,
      userId: "user_456",
      returnTo: "/dashboard",
      expiresInSeconds: 3600
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == nil)
  }

  @Test func planIsNilWhenUserIdIsEmptyString() {
    let response = NativeAuthExchangeResponse(
      ticket: "ticket_fallback",
      sessionToken: "native-session-token",
      sessionId: nil,
      userId: "",
      returnTo: "/dashboard",
      expiresInSeconds: 3600
    )

    let plan = MobileAuthFinalizationPlanner.plan(for: response)

    #expect(plan == nil)
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

    #expect(result.shouldUseLiveAuth == false)
    #expect(result.authErrorMessage == nil)
  }

  @Test func liveLaunchConfigurationEnablesBetterAuthForValidLiveConfig() {
    let configuration = testConfiguration()

    let result = LiveLaunchConfigurationResolver.resolve(
      launchMode: .live,
      loadLiveConfiguration: { configuration },
      loadUnvalidatedConfiguration: { testConfiguration() }
    )

    #expect(result.shouldUseLiveAuth == true)
    #expect(result.authErrorMessage == nil)
  }

  @Test func missingVerifierDoesNotSignOutWhenCallbackStateAlreadyHandled() {
    #expect(
      !shouldSignOutAfterMissingVerifier(
        callbackState: "state_123",
        handledStates: ["state_123"],
        hasFinalizeInFlight: false,
        hasStoredSession: false
      )
    )
  }

  @Test func missingVerifierDoesNotSignOutWhenFinalizeIsInFlight() {
    #expect(
      !shouldSignOutAfterMissingVerifier(
        callbackState: "state_123",
        handledStates: [],
        hasFinalizeInFlight: true,
        hasStoredSession: false
      )
    )
  }

  @Test func missingVerifierDoesNotSignOutWhenNativeSessionExists() {
    #expect(
      !shouldSignOutAfterMissingVerifier(
        callbackState: "state_123",
        handledStates: [],
        hasFinalizeInFlight: false,
        hasStoredSession: true
      )
    )
  }

  @Test func missingVerifierMaySignOutWhenNothingElseClaimsTheCallback() {
    #expect(
      shouldSignOutAfterMissingVerifier(
        callbackState: "state_123",
        handledStates: [],
        hasFinalizeInFlight: false,
        hasStoredSession: false
      )
    )
  }

  @Test @MainActor func duplicateCallbackAfterConsumedVerifierDoesNotSignOut() async {
    let store = MobileAuthPendingStore(
      defaults: UserDefaults(
        suiteName: "MobileAuthFinalizationDuplicateCallback-\(UUID().uuidString)"
      )!
    )
    let callbackURL = URL(
      string: "ie.jov.jovie://auth/complete?code=code_123&state=state_123"
    )!
    store.save(codeVerifier: "verifier_123")

    var handledStates: Set<String> = []
    if let state = MobileAuthReturnParser.callbackState(callbackURL) {
      handledStates.insert(state)
    }

    let first = await MobileAuthReturnParser.parse(
      callbackURL,
      pendingStore: store
    )
    let second = await MobileAuthReturnParser.parse(
      callbackURL,
      pendingStore: store
    )

    #expect(first != nil)
    #expect(second == nil)
    #expect(
      !shouldSignOutAfterMissingVerifier(
        callbackState: MobileAuthReturnParser.callbackState(callbackURL),
        handledStates: handledStates,
        hasFinalizeInFlight: true,
        hasStoredSession: false
      )
    )
    #expect(
      !shouldSignOutAfterMissingVerifier(
        callbackState: MobileAuthReturnParser.callbackState(callbackURL),
        handledStates: handledStates,
        hasFinalizeInFlight: false,
        hasStoredSession: true
      )
    )
    #expect(
      shouldSignOutAfterMissingVerifier(
        callbackState: MobileAuthReturnParser.callbackState(callbackURL),
        handledStates: [],
        hasFinalizeInFlight: false,
        hasStoredSession: false
      )
    )
  }

  private func testConfiguration() -> AppConfiguration {
    AppConfiguration(
      apiBaseURL: URL(string: "https://jov.ie")!,
      webBaseURL: URL(string: "https://jov.ie")!,
      sentryDSN: nil,
      observabilityIngestURL: nil,
      observabilityIngestSecret: nil,
      observabilityEnvironment: "test"
    )
  }
}
