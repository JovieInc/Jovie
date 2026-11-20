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
}
