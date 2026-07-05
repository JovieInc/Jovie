import Testing
@testable import Jovie

struct ConversationUserActivityTests {
  @Test func payloadRoundTripsConversationMetadata() {
    let userInfo = ConversationUserActivity.userInfo(
      for: ConversationUserActivity.Payload(
        conversationID: "conv_123",
        title: "Launch plan"
      )
    )

    #expect(
      ConversationUserActivity.payload(from: userInfo) ==
        ConversationUserActivity.Payload(
          conversationID: "conv_123",
          title: "Launch plan"
        )
    )
  }

  @Test func payloadFallsBackToDefaultTitle() {
    let payload = ConversationUserActivity.payload(
      from: [ConversationUserActivity.conversationIDKey: "conv_456"]
    )

    #expect(payload == ConversationUserActivity.Payload(
      conversationID: "conv_456",
      title: "Jovie Chat"
    ))
  }

  @Test func displayTitleUsesConversationTitleWhenPresent() {
    let conversation = MobileConversationSummary(
      id: "conv_789",
      title: "  Release prep  ",
      createdAt: "2026-07-02T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z",
      latestMessageRole: "assistant",
      latestTurnStatus: "completed"
    )

    #expect(ConversationUserActivity.displayTitle(for: conversation) == "Release prep")
  }
}