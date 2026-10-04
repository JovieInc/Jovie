import Foundation
import Testing
@testable import Jovie

extension MobileAuthFinalizationTests {
  @Test(arguments: ["nil-to-B", "A-to-B", "same-bytes", "external-change", "consume", "clear"])
  @MainActor func pendingSnapshotsFenceReplacementAndConsumeOnlyOnce(change: String) throws {
    let suite = "MobileAuthPendingSnapshotTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = MobileAuthPendingStore(defaults: defaults)
    if change != "nil-to-B" { store.save(codeVerifier: "verifier-A") }
    let original = store.snapshot()
    switch change {
    case "nil-to-B", "A-to-B": store.save(codeVerifier: "verifier-B")
    case "same-bytes": store.save(codeVerifier: "verifier-A")
    case "external-change":
      defaults.set("verifier-B", forKey: "ie.jov.Jovie.auth.pendingCodeVerifier")
    case "consume":
      #expect(store.consumeCodeVerifier(matching: original) == "verifier-A")
      #expect(store.consumeCodeVerifier(matching: original) == nil)
      #expect(!store.clear(matching: original) && !store.hasCodeVerifier())
      return
    default:
      #expect(store.clear(matching: original))
      #expect(!store.clear(matching: original))
      #expect(store.consumeCodeVerifier(matching: original) == nil && !store.hasCodeVerifier())
      return
    }
    let replacement = store.snapshot()
    #expect(!store.isCurrent(original))
    #expect(store.consumeCodeVerifier(matching: original) == nil)
    #expect(!store.clear(matching: original))
    #expect(store.isCurrent(replacement) && store.hasCodeVerifier())
    #expect(store.consumeCodeVerifier(matching: replacement) == (change == "same-bytes" ? "verifier-A" : "verifier-B"))
  }
}

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

extension MobileAuthFinalizationTests {
  @Test(arguments: ["matching", "universal", "missing", "wrong", "duplicate", "empty", "malformed",
    "foreign-origin", "legacy", "wrong-family", "bad-version", "corrupt"])
  @MainActor func correlatedPendingSurvivesColdIngressWithoutAcceptingAnotherAttempt(change: String) throws {
    let suite = "NativeAttemptTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let baseURL = URL(string: "https://jov.ie")!
    let nonce = String(repeating: "A", count: 43)
    let store = MobileAuthPendingStore(defaults: defaults)
    #expect(store.save(codeVerifier: "verifier", nativeAttempt: nonce, baseURL: baseURL))
    let key = "ie.jov.Jovie.auth.pendingCodeVerifier"
    if change == "legacy" { store.save(codeVerifier: "verifier") }
    if change == "wrong-family" || change == "bad-version" {
      let data = try #require(defaults.data(forKey: key))
      var value = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
      if change == "wrong-family" { value["client"] = "electron" }
      else { value["version"] = 2 }
      defaults.set(try JSONSerialization.data(withJSONObject: value), forKey: key)
    }
    if change == "corrupt" { defaults.set(Data("{".utf8), forKey: key) }
    let coldStore = MobileAuthPendingStore(defaults: defaults)
    let before = coldStore.snapshot(), bytes = defaults.object(forKey: key) as? Data
    let origin = change == "foreign-origin" ? "https://staging.jov.ie/auth/ios/complete"
      : change == "universal" ? "https://jov.ie/auth/ios/complete" : "ie.jov.jovie://auth/complete"
    var components = try #require(URLComponents(string: origin))
    components.queryItems = [URLQueryItem(name: "code", value: "code"), URLQueryItem(name: "state", value: "state")]
    if change != "missing" {
      let value = change == "wrong" ? String(repeating: "B", count: 43)
        : change == "empty" ? "" : change == "malformed" ? nonce + "\n" : nonce
      components.queryItems?.append(URLQueryItem(name: "native_attempt", value: value))
    }
    if change == "duplicate" { components.queryItems?.append(URLQueryItem(name: "native_attempt", value: nonce)) }
    let url = try #require(components.url)
    let claim = coldStore.claim(url, matching: before, baseURL: baseURL)
    if change == "matching" || change == "universal" {
      let accepted = try #require(claim)
      #expect(accepted.authReturn == MobileAuthReturn(code: "code", state: "state",
        codeVerifier: "verifier", nativeAttempt: nonce))
      #expect(!coldStore.hasCodeVerifier() && coldStore.isCurrent(accepted))
      #expect(coldStore.claim(url, matching: before, baseURL: baseURL) == nil)
      #expect(coldStore.consumeCodeVerifier() == nil && coldStore.isCurrent(accepted))
      let afterCrash = MobileAuthPendingStore(defaults: defaults)
      #expect(afterCrash.claim(url, matching: afterCrash.snapshot(), baseURL: baseURL) == nil)
    } else {
      #expect(claim == nil && coldStore.isCurrent(before))
      #expect(defaults.object(forKey: key) as? Data == bytes)
      if change == "legacy" { #expect(defaults.string(forKey: key) == "verifier") }
    }
  }

  @Test(arguments: ["rearm", "finish", "replacement", "same-bytes", "reclaimed"])
  @MainActor func pendingClaimCleanupAndRearmConsumeOnlyTheirExactLease(change: String) throws {
    let suite = "NativeAttemptLeaseTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = MobileAuthPendingStore(defaults: defaults)
    let baseURL = URL(string: "https://jov.ie")!, nonce = String(repeating: "A", count: 43)
    let url = URL(string: "ie.jov.jovie://auth/complete?code=code&state=state&native_attempt=\(nonce)")!
    #expect(store.save(codeVerifier: "A", nativeAttempt: nonce, baseURL: baseURL))
    let original = try #require(store.claim(url, matching: store.snapshot(), baseURL: baseURL))
    if change == "finish" {
      store.finish(original)
      #expect(!store.rearm(original) && !store.hasCodeVerifier())
      let empty = store.snapshot()
      store.finish(original)
      #expect(store.isCurrent(empty))
      return
    }
    if change == "rearm" || change == "reclaimed" {
      #expect(store.rearm(original) && store.hasCodeVerifier())
      if change == "reclaimed" {
        _ = try #require(store.claim(url, matching: store.snapshot(), baseURL: baseURL))
      }
    } else {
      #expect(store.save(codeVerifier: "A", nativeAttempt: change == "same-bytes" ? nonce
        : String(repeating: "B", count: 43), baseURL: baseURL))
    }
    let current = store.snapshot()
    #expect(!store.rearm(original))
    store.finish(original)
    #expect(store.isCurrent(current))
    if change == "rearm" {
      let cold = MobileAuthPendingStore(defaults: defaults)
      #expect(cold.claim(url, matching: cold.snapshot(), baseURL: baseURL) != nil)
    }
  }
}
