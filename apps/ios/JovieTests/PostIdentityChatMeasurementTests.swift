import Foundation
import JovieKit
import Testing
@testable import Jovie

/// `.serialized`: these tests swap process-global state (`Observability` provider and the
/// `FirstValueLandingPolicy` / `PostIdentityChatMeasurement` defaults overrides). Swift Testing
/// runs tests in a suite concurrently, so unserialized they clobber each other's overrides.
@Suite(.serialized)
struct PostIdentityChatMeasurementTests {
  @Test func postIdentityChatEventsUseDistinctStableNames() {
    #expect(ObservabilityEvent.identityFirstValueSeen.rawValue == "identity_first_value_seen")
    #expect(ObservabilityEvent.chatEmptyHomeSeen.rawValue == "chat_empty_home_seen")
    #expect(ObservabilityEvent.chatEmptyHomeDwell.rawValue == "chat_empty_home_dwell")
    #expect(ObservabilityEvent.chatFirstSendStarted.rawValue == "chat_first_send_started")
    #expect(ObservabilityEvent.chatFirstSendSucceeded.rawValue == "chat_first_send_succeeded")
    #expect(ObservabilityEvent.chatFirstSendCancelled.rawValue == "chat_first_send_cancelled")
    #expect(ObservabilityEvent.chatFirstSendFailed.rawValue == "chat_first_send_failed")
    #expect(ObservabilityEvent.chatFirstSendCancelled != ObservabilityEvent.chatFirstSendFailed)
  }

  @Test func failureReasonIsStableMachineTokenWithoutPromptText() {
    #expect(
      PostIdentityChatMeasurement.failureReason(for: APIClientError.missingToken) == "missing_token"
    )
    #expect(
      PostIdentityChatMeasurement.failureReason(
        for: APIClientError.requestFailed(statusCode: 401)
      ) == "terminal_auth"
    )
    #expect(
      PostIdentityChatMeasurement.failureReason(
        for: MobileChatClientError.requestFailed(statusCode: 503)
      ) == "http_503"
    )
    #expect(
      PostIdentityChatMeasurement.failureReason(for: NSError(domain: "other", code: 1))
        == "send_failed"
    )
  }

  @Test func streamTerminalMapsFailCancelAndSuccessWithoutThrowing() {
    let missing = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: true,
      isFailed: false,
      isCanceled: false
    )
    #expect(missing.outcome == .failed)
    #expect(missing.failureReason == "missing_terminal_state")
    #expect(missing.clearLastError == false)

    let streamFailed = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: false,
      isFailed: true,
      isCanceled: false
    )
    #expect(streamFailed.outcome == .failed)
    #expect(streamFailed.failureReason == "stream_failed")
    #expect(streamFailed.clearLastError == false)

    let streamCanceled = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: false,
      isFailed: false,
      isCanceled: true
    )
    #expect(streamCanceled.outcome == .cancelled)
    #expect(streamCanceled.failureReason == nil)
    #expect(streamCanceled.clearLastError == false)

    let succeeded = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: false,
      isFailed: false,
      isCanceled: false
    )
    #expect(succeeded.outcome == .succeeded)
    #expect(succeeded.failureReason == nil)
    #expect(succeeded.clearLastError)
  }

  @Test func streamReportedFailAndCancelEmitDistinctOutcomes() {
    let suiteName = "jovie.postIdentity.streamTerminal.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    let failProvider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(failProvider)
    defer {
      Observability.resetForTesting()
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let failUser = "user_stream_fail"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: failUser, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: failUser, launchMode: .live)
    #expect(
      PostIdentityChatMeasurement.noteFirstSendStarted(userID: failUser, launchMode: .live)
    )
    let failDecision = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: false,
      isFailed: true,
      isCanceled: false
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: failUser,
        launchMode: .live,
        outcome: failDecision.outcome,
        failureReason: failDecision.failureReason
      )
    )
    #expect(failProvider.breadcrumbs.map(\.event).contains(.chatFirstSendFailed))
    #expect(failProvider.breadcrumbs.map(\.event).contains(.chatFirstSendCancelled) == false)

    let cancelProvider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(cancelProvider)
    let cancelUser = "user_stream_cancel"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: cancelUser, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: cancelUser, launchMode: .live)
    #expect(
      PostIdentityChatMeasurement.noteFirstSendStarted(userID: cancelUser, launchMode: .live)
    )
    let cancelDecision = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: false,
      isFailed: false,
      isCanceled: true
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: cancelUser,
        launchMode: .live,
        outcome: cancelDecision.outcome,
        failureReason: cancelDecision.failureReason
      )
    )
    #expect(cancelProvider.breadcrumbs.map(\.event).contains(.chatFirstSendCancelled))
    #expect(cancelProvider.breadcrumbs.map(\.event).contains(.chatFirstSendFailed) == false)
  }

  @Test func upgradeWithIdentityBitAloneIsNotEligibleWithoutArming() {
    let suiteName = "jovie.postIdentity.eligibility.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    defer {
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let userID = "user_post_identity"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    // Pre-existing Identity bit without cohort arming must not count as customers.
    #expect(PostIdentityChatMeasurement.isEligible(userID: userID, launchMode: .live) == false)

    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: userID, launchMode: .live)
    #expect(PostIdentityChatMeasurement.isEligible(userID: userID, launchMode: .live))
    #expect(
      PostIdentityChatMeasurement.isEligible(
        userID: userID,
        launchMode: .live,
        isFixtureSeeded: true
      ) == false
    )
    #expect(
      PostIdentityChatMeasurement.isEligible(userID: userID, launchMode: .uiTestingChat) == false
    )
  }

  @Test func emptyHomeAndFirstSendStagesEmitOnceWithoutTreatingCancelAsFail() throws {
    let suiteName = "jovie.postIdentity.stages.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer {
      Observability.resetForTesting()
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let userID = "user_stages"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: userID, launchMode: .live)

    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeSeen(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: false
      ) == false
    )
    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeSeen(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: true
      )
    )
    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeSeen(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: true
      ) == false
    )

    #expect(
      PostIdentityChatMeasurement.noteFirstSendStarted(userID: userID, launchMode: .live)
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: userID,
        launchMode: .live,
        outcome: .cancelled
      )
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: userID,
        launchMode: .live,
        outcome: .failed,
        failureReason: "http_500"
      )
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: userID,
        launchMode: .live,
        outcome: .succeeded
      )
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: userID,
        launchMode: .live,
        outcome: .succeeded
      ) == false
    )

    let events = provider.breadcrumbs.map(\.event)
    #expect(events.contains(.identityFirstValueSeen))
    #expect(events.contains(.chatEmptyHomeSeen))
    #expect(events.contains(.chatFirstSendStarted))
    #expect(events.contains(.chatFirstSendCancelled))
    #expect(events.contains(.chatFirstSendFailed))
    #expect(events.contains(.chatFirstSendSucceeded))
    #expect(ObservabilityEvent.chatFirstSendCancelled != ObservabilityEvent.chatFirstSendFailed)

    let cancelled = try #require(provider.breadcrumbs.first { $0.event == .chatFirstSendCancelled })
    #expect(cancelled.context["reason"] as? String == "user_or_task_cancelled")
    let failed = try #require(provider.breadcrumbs.first { $0.event == .chatFirstSendFailed })
    #expect(failed.context["reason"] as? String == "http_500")
    #expect(failed.context["prompt"] == nil)
    #expect(failed.context["text"] == nil)
  }

  @Test func retryAfterFailCanStillEmitFirstSendSucceeded() {
    let suiteName = "jovie.postIdentity.retrySuccess.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer {
      Observability.resetForTesting()
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let userID = "user_retry_success"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: userID, launchMode: .live)

    #expect(PostIdentityChatMeasurement.noteFirstSendStarted(userID: userID, launchMode: .live))
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: userID,
        launchMode: .live,
        outcome: .failed,
        failureReason: "http_500"
      )
    )
    // Retry path must not start again, but may complete success.
    #expect(
      PostIdentityChatMeasurement.noteFirstSendStarted(
        userID: userID,
        launchMode: .live,
        isRetry: true
      ) == false
    )
    #expect(
      PostIdentityChatMeasurement.noteFirstSendOutcome(
        userID: userID,
        launchMode: .live,
        outcome: .succeeded
      )
    )
    #expect(provider.breadcrumbs.map(\.event).contains(.chatFirstSendSucceeded))
  }

  @Test func priorUserMessagesBlockFirstSendStarted() {
    let suiteName = "jovie.postIdentity.priorMessages.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    defer {
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let userID = "user_prior"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: userID, launchMode: .live)
    #expect(
      PostIdentityChatMeasurement.noteFirstSendStarted(
        userID: userID,
        launchMode: .live,
        hadPriorUserMessages: true
      ) == false
    )
  }

  @Test func emptyHomeDwellRequiresPriorEmptySeenAndNoStartedSend() {
    let suiteName = "jovie.postIdentity.dwell.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer {
      Observability.resetForTesting()
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let userID = "user_dwell"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: userID, launchMode: .live)

    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeDwell(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: true
      ) == false
    )

    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeSeen(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: true
      )
    )
    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeDwell(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: true
      )
    )
    #expect(
      PostIdentityChatMeasurement.noteEmptyChatHomeDwell(
        userID: userID,
        launchMode: .live,
        isEmpty: true,
        isChatSurfaceVisible: true
      ) == false
    )
    #expect(provider.breadcrumbs.map(\.event).contains(.chatEmptyHomeDwell))
  }

  @Test func retriesDoNotInflateFirstSendStarted() {
    let suiteName = "jovie.postIdentity.retry.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    defer {
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let userID = "user_retry"
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    PostIdentityChatMeasurement.noteIdentityFirstValueSeen(userID: userID, launchMode: .live)
    #expect(
      PostIdentityChatMeasurement.noteFirstSendStarted(
        userID: userID,
        launchMode: .live,
        isRetry: true
      ) == false
    )
  }

  @Test @MainActor func identityLandEmitsDenominatorBreadcrumbOnce() throws {
    let suiteName = "jovie.postIdentity.identityLand.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previousFirstValue = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    let previousMeasurement = PostIdentityChatMeasurement.replaceDefaultsForTesting(defaults)
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer {
      Observability.resetForTesting()
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previousFirstValue)
      _ = PostIdentityChatMeasurement.replaceDefaultsForTesting(previousMeasurement)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let configuration = AppConfiguration(
      apiBaseURL: URL(string: "http://localhost:3100")!,
      webBaseURL: URL(string: "https://jov.ie")!,
      sentryDSN: nil,
      observabilityIngestURL: nil,
      observabilityIngestSecret: nil,
      observabilityEnvironment: "test"
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: PostIdentityStubRepository(),
      brightnessManager: PostIdentityStubBrightness()
    )
    appState.activeUserID = "user_identity_land"

    appState.lockReadyShellInitialTab(markIdentityFirstValue: true)
    #expect(FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: "user_identity_land"))
    #expect(
      PostIdentityChatMeasurement.isEligible(userID: "user_identity_land", launchMode: .live)
    )
    let seen = try #require(provider.breadcrumbs.first { $0.event == .identityFirstValueSeen })
    #expect(seen.context["stage"] as? String == "identity_landed")
    let countAfterFirstMark = provider.breadcrumbs.count

    appState.lockReadyShellInitialTab(markIdentityFirstValue: true)
    #expect(provider.breadcrumbs.count == countAfterFirstMark)
  }
}

private struct PostIdentityStubRepository: AppStateRepository {
  func loadMe(for _: String) async throws -> MeRepositoryResult {
    MeRepositoryResult(response: .previewReady, isStale: false)
  }

  func clearCachedUser(_: String) async {}
  func clearCachedUser(_: String, ifOwnedBy _: NativeSessionOwnership) async {}
}

private final class PostIdentityStubBrightness: BrightnessControlling, @unchecked Sendable {
  func setMaxBrightness() async {}
  func restoreBrightness() async {}
}
