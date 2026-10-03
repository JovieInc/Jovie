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

@MainActor
private final class AuthFinalizationProbe {
  var slot = MobileAuthFinalizationSlot()
  var outcomes: [NativeAuthResolution.Outcome] = []
  var errors = 0
  var failures = 0
  var settled = 0

  func start(_ gate: ProfileLoadGate, rejects: Bool = false) -> (NativeAuthAttempt, Task<Void, Never>) {
    let attempt = NativeSessionTokenStore.beginAuthAttempt()
    slot.install(attempt) { [self] in
      defer { slot.release(attempt) }
      await finalizeMobileAuthAttempt(attempt, exchange: {
        _ = await gate.wait() // Deliberately ignores cancellation, like a late network completion.
        if rejects { throw APIClientError.invalidResponse }
        return NativeAuthExchangeResponse(ticket: nil, sessionToken: "same-token", sessionId: nil,
          userId: "same-user", returnTo: "/app", expiresInSeconds: 3_600)
      }, reconcile: reconcile, failure: { claim, _ in
        NativeSessionTokenStore.performIfCurrent(claim) { _ in failures += 1 }
        if let completion = NativeSessionTokenStore.completeCleanup(claim) {
          NativeSessionTokenStore.finishAuthCleanup(completion)
        }
        return nil
      }, settled: { result in
        NativeSessionTokenStore.performIfCurrent(result) { settled += 1 }
      })
      await gate.ownerFinished()
    }
    return (attempt, slot.task!)
  }

  func reconcile(_ result: NativeAuthResolution, _ error: Error?) -> Task<Void, Never>? {
    NativeSessionTokenStore.consume(result) { _, _ in
      outcomes.append(result.outcome)
      if error != nil { errors += 1 }
    }
    return nil
  }
}

extension MobileAuthFinalizationTests {
  @Test(arguments: [false, true], [false, true]) @MainActor
  func acceptedAttemptOwnsBothCompletionOrders(oldFirst: Bool, oldRejects: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let script = NativeAuthSecurityScript()
      let previous = NativeSessionTokenStore.replaceSecurityOperationsForTesting(script.operations)
      defer { _ = NativeSessionTokenStore.replaceSecurityOperationsForTesting(previous) }
      let probe = AuthFinalizationProbe(), oldGate = ProfileLoadGate(), newGate = ProfileLoadGate()
      let (_, old) = probe.start(oldGate, rejects: oldRejects)
      #expect(await oldGate.waitUntilEntered())
      let (newAttempt, new) = probe.start(newGate)
      #expect(await newGate.waitUntilEntered())
      if oldFirst {
        await oldGate.complete(true); await old.value
        #expect(probe.slot.attempt == newAttempt, "Late A release must preserve B's cancel handle")
        #expect(probe.outcomes.isEmpty)
      }
      await newGate.complete(true); await new.value
      if !oldFirst { await oldGate.complete(true); await old.value }
      #expect(probe.outcomes == [.persisted])
      #expect(probe.errors == 0 && probe.failures == 0 && probe.settled == 1)
      #expect(NativeSessionTokenStore.load()?.token == "same-token")
      #expect(!NativeSessionTokenStore.hasPendingAuth && probe.slot.task == nil)
      #expect(script.calls.filter { $0 == "add" }.count == 1)
    }
  }

  @Test @MainActor func disappearanceResolvesLeaseBeforeNoncooperativeExchangeReturns() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let probe = AuthFinalizationProbe(), gate = ProfileLoadGate()
      let (attempt, task) = probe.start(gate)
      #expect(await gate.waitUntilEntered())
      probe.slot.cancel(attempt) { _ = probe.reconcile($0, nil) }
      #expect(!NativeSessionTokenStore.hasPendingAuth && probe.slot.task == nil)
      #expect(probe.outcomes.count == 1 && probe.errors == 0)
      let nextGate = ProfileLoadGate()
      let (next, nextTask) = probe.start(nextGate)
      #expect(await nextGate.waitUntilEntered())
      await gate.complete(true); await task.value
      #expect(probe.slot.attempt == next && probe.outcomes.count == 1)
      let thirdGate = ProfileLoadGate()
      let (third, thirdTask) = probe.start(thirdGate)
      #expect(await thirdGate.waitUntilEntered())
      await nextGate.complete(true); await nextTask.value
      #expect(probe.slot.attempt == third)
      probe.slot.cancel(third) { _ = probe.reconcile($0, nil) }
      await thirdGate.complete(true); await thirdTask.value
      #expect(probe.outcomes.count == 2 && probe.failures == 0 && probe.settled == 0)
    }
  }

  @Test(arguments: [false, true]) @MainActor
  func stagedCancellationStaysSilentWhileGenuineFailureClaimsCleanup(cancelled: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      var errors = 0, cleanup = 0, recovery = 0
      await finalizeMobileAuthAttempt(attempt, exchange: {
        if cancelled { throw CancellationError() }
        throw APIClientError.invalidResponse
      }, reconcile: { result, error in
        NativeSessionTokenStore.consume(result) { _, _ in recovery += 1; if error != nil { errors += 1 } }
        return nil
      }, failure: { claim, _ in
        NativeSessionTokenStore.performIfCurrent(claim) { _ in cleanup += 1 }
        return nil
      }, settled: { _ in })
      #expect(recovery == (cancelled ? 1 : 0) && cleanup == (cancelled ? 0 : 1) && errors == 0)
    }
  }

  @Test(arguments: [false, true]) @MainActor
  func rejectedEntryNeverInvokesExchange(stale: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      let replacement = stale ? NativeSessionTokenStore.beginAuthAttempt() : nil
      var exchanges = 0, recoveries = 0
      let task = Task { @MainActor in
        if !stale { withUnsafeCurrentTask { $0?.cancel() } }
        await finalizeMobileAuthAttempt(attempt, exchange: {
          exchanges += 1
          throw APIClientError.invalidResponse
        }, reconcile: { result, error in
          NativeSessionTokenStore.consume(result) { _, _ in recoveries += 1 }
          #expect(error == nil)
          return nil
        }, failure: { _, _ in Issue.record("Rejected entry claimed failure cleanup"); return nil }, settled: { _ in })
      }
      await task.value
      #expect(exchanges == 0 && recoveries == (stale ? 0 : 1))
      #expect(NativeSessionTokenStore.hasPendingAuth == stale)
      if let replacement { #expect(NativeSessionTokenStore.performIfCurrent(replacement, {})) }
    }
  }

  @Test @MainActor func unprovenErrorsCannotMutateAcceptedOrVisibleAuth() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      var presentations = 0
      #expect(presentUnprovenMobileAuthError(route: .signedOut, hasFinalizeInFlight: false) { presentations += 1 })
      for route in [AppRouter.ready, .needsOnboarding, .waitlistPending, .launching] {
        #expect(!presentUnprovenMobileAuthError(route: route, hasFinalizeInFlight: false) { presentations += 1 })
      }
      #expect(!presentUnprovenMobileAuthError(route: .signedOut, hasFinalizeInFlight: true) { presentations += 1 })
      _ = NativeSessionTokenStore.beginAuthAttempt()
      #expect(!presentUnprovenMobileAuthError(route: .signedOut, hasFinalizeInFlight: false) { presentations += 1 })
      #expect(presentations == 1)
    }
  }
}

extension MobileAuthFinalizationTests {
  @Test(arguments: [
    NativeAuthExchangeError.rejectedBeforeConsume(reason: "missing"),
    .requestFailed(statusCode: 401, reason: "missing"),
    .requestFailed(statusCode: 401, reason: "ott_invalid"),
    .transportFailed(code: -1005), .decodingFailed,
  ]) @MainActor
  func exchangePhaseSurvivesStageWrappingWithoutReclassifyingOtherFailures(error: NativeAuthExchangeError) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let previous = NativeSessionTokenStore.captureSessionContext()
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      var resolutions = 0, failures = 0, settled = 0
      await finalizeMobileAuthAttempt(attempt, exchange: { throw error }, reconcile: { result, received in
        NativeSessionTokenStore.consume(result) { _, receipt in
          resolutions += 1
          #expect(result.origin == .cancellation && receipt == nil)
          #expect(received?.localizedDescription.contains("Native auth exchange failed") == true)
        }
        return nil
      }, failure: { claim, received in
        NativeSessionTokenStore.performIfCurrent(claim) { _ in failures += 1 }
        #expect(received.localizedDescription.contains("Native auth exchange failed"))
        return nil
      }, settled: { result in
        NativeSessionTokenStore.performIfCurrent(result) { settled += 1 }
      })
      let rejected = error == .rejectedBeforeConsume(reason: "missing")
      #expect(resolutions == (rejected ? 1 : 0) && failures == (rejected ? 0 : 1))
      #expect(settled == (rejected ? 1 : 0))
      if rejected { #expect(NativeSessionTokenStore.captureSessionContext() == previous) }
    }
  }
}
