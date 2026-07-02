import Testing
@testable import Jovie

@MainActor
@Suite(.serialized)
struct IntentNavigationStoreTests {
  @Test func submitThenConsumeReturnsRequestOnce() {
    let store = IntentNavigationStore()

    #expect(store.consume() == nil)

    store.submit(.openChat)
    #expect(store.pending == .openChat)
    #expect(store.consume() == .openChat)
    #expect(store.consume() == nil)
  }

  @Test func latestSubmissionWins() {
    let store = IntentNavigationStore()

    store.submit(.openChat)
    store.submit(.sendMessage(text: "hi", autoSend: true))

    #expect(store.consume() == .sendMessage(text: "hi", autoSend: true))
  }
}
