import Foundation

extension ChatRepository {
  func notePostIdentityFirstSendStarted(isRetry: Bool) {
    _ = PostIdentityChatMeasurement.noteFirstSendStarted(
      userID: identity.userID,
      launchMode: LaunchMode.current(),
      isFixtureSeeded: isFixtureSeeded,
      isRetry: isRetry
    )
  }

  func notePostIdentityFirstSendOutcome(
    _ outcome: PostIdentityChatMeasurement.FirstSendOutcome,
    isRetry: Bool,
    failureReason: String? = nil
  ) {
    _ = PostIdentityChatMeasurement.noteFirstSendOutcome(
      userID: identity.userID,
      launchMode: LaunchMode.current(),
      outcome: outcome,
      isFixtureSeeded: isFixtureSeeded,
      isRetry: isRetry,
      failureReason: failureReason
    )
  }
}
