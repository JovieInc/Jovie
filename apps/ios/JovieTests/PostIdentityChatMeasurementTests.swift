import Foundation
import Testing
@testable import Jovie

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

  @Test func liveIdentityGateExcludesFixturesAndUnearnedIdentity() {
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
    #expect(
      PostIdentityChatMeasurement.isEligible(userID: userID, launchMode: .live) == false
    )

    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
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

  @Test func retriesDoNotInflateFirstSendStages() {
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
        outcome: .succeeded,
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
}

private final class PostIdentityStubBrightness: BrightnessControlling, @unchecked Sendable {
  func setMaxBrightness() async {}
  func restoreBrightness() async {}
}
