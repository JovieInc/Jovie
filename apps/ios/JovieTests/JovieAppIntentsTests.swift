import Testing
@testable import Jovie

@MainActor
@Suite(.serialized)
struct JovieAppIntentsTests {
  @Test func openChatIntentRequestsChat() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await OpenChatIntent().perform()

    #expect(IntentNavigationStore.shared.consume() == .openChat)
  }

  @Test func sendMessageIntentRequestsMessageText() async throws {
    IntentNavigationStore.shared.consume()

    let intent = SendMessageIntent()
    intent.message = "launch my single"
    _ = try await intent.perform()

    #expect(
      IntentNavigationStore.shared.consume() == .sendMessage("launch my single")
    )
  }

  @Test func continueLastConversationIntentRequestsResume() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await ContinueLastConversationIntent().perform()

    #expect(
      IntentNavigationStore.shared.consume() == .continueLastConversation
    )
  }
}
