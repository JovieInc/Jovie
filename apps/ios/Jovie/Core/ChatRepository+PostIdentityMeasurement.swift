import Foundation

extension ChatRepository {
  func notePostIdentityFirstSendStarted(isRetry: Bool, hadPriorUserMessages: Bool) {
    _ = PostIdentityChatMeasurement.noteFirstSendStarted(
      userID: identity.userID,
      launchMode: LaunchMode.current(),
      isFixtureSeeded: isFixtureSeeded,
      isRetry: isRetry,
      hadPriorUserMessages: hadPriorUserMessages
    )
  }

  func notePostIdentityFirstSendOutcome(
    _ outcome: PostIdentityChatMeasurement.FirstSendOutcome,
    failureReason: String? = nil
  ) {
    _ = PostIdentityChatMeasurement.noteFirstSendOutcome(
      userID: identity.userID,
      launchMode: LaunchMode.current(),
      outcome: outcome,
      isFixtureSeeded: isFixtureSeeded,
      failureReason: failureReason
    )
  }

  func notePostIdentityFirstSendCancelled() {
    notePostIdentityFirstSendOutcome(.cancelled)
  }

  func notePostIdentityFirstSendFailed(error: Error) {
    notePostIdentityFirstSendOutcome(
      .failed,
      failureReason: PostIdentityChatMeasurement.failureReason(for: error)
    )
  }

  /// Emit first-send outcome after a non-throwing stream completion.
  func notePostIdentityFirstSendAfterStream(
    wasInFlight: Bool,
    status: MobileChatTimelineStatus?
  ) {
    let decision = PostIdentityChatMeasurement.decideStreamTerminal(
      missingTerminalState: wasInFlight,
      isFailed: status == .failed,
      isCanceled: status == .canceled
    )
    if decision.clearLastError {
      lastErrorMessage = nil
    }
    notePostIdentityFirstSendOutcome(decision.outcome, failureReason: decision.failureReason)
  }
}
