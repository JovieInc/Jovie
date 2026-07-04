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
      IntentNavigationStore.shared.consume() ==
        .sendMessage(text: "launch my single", autoSend: true)
    )
  }

  @Test func continueLastConversationIntentRequestsResume() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await ContinueLastConversationIntent().perform()

    #expect(
      IntentNavigationStore.shared.consume() == .continueLastConversation
    )
  }

  @Test func startVoiceCaptureIntentRequestsVoice() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await StartVoiceCaptureIntent().perform()

    #expect(IntentNavigationStore.shared.consume() == .startVoiceCapture)
  }

  @Test func shortcutsExposeVoiceCapture() {
    #expect(JovieAppShortcuts.appShortcuts.count == 4)
  }
}
