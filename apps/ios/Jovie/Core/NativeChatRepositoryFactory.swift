import Foundation

@MainActor
enum NativeChatRepositoryFactory {
  static func make(
    identity: NativeChatIdentity,
    apiBaseURL: URL,
    webBaseURL: URL,
    cache: any ChatCaching,
    onSessionExpired: @escaping @MainActor (NativeSessionExpiryReceipt) async -> Void
  ) -> ChatRepository {
    ChatRepository(
      client: MobileChatClient(
        baseURL: apiBaseURL,
        tokenProvider: NativeSessionTokenProvider(),
        workspace: identity.workspace,
        identity: identity
      ),
      cache: cache,
      userID: identity.userID,
      webBaseURL: webBaseURL,
      workspace: identity.workspace,
      identity: identity,
      onSessionExpired: onSessionExpired
    )
  }
}
