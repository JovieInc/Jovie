import Foundation

#if os(macOS)
/// Mac development boundary compiles ChatRepository without iOS Observability.
/// Keep PostIdentity hooks as no-ops so JovieMac stays green (JOV-14016).
extension ChatRepository {
  func notePostIdentityFirstSendStarted(isRetry: Bool, hadPriorUserMessages: Bool) {}

  func notePostIdentityFirstSendCancelled() {}

  func notePostIdentityFirstSendFailed(error: Error) {}

  func notePostIdentityFirstSendAfterStream(
    wasInFlight: Bool,
    status: MobileChatTimelineStatus?
  ) {}
}
#endif
