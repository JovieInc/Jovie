import Foundation
import JovieKit
import Testing

struct MobileConversationModelsTests {
  @Test func conversationListPreservesTheWireContract() throws {
    let fixture = Data(#"""
    {"conversations":[{"id":"conv_1","title":"Café 🎵","createdAt":"2026-06-01T00:00:00.123Z","updatedAt":"2026-06-02T00:00:00+02:00","latestMessageRole":"assistant","latestTurnStatus":"future_state"}]}
    """#.utf8)
    let expected = MobileConversationListResponse(conversations: [
      MobileConversationSummary(
        id: "conv_1",
        title: "Café 🎵",
        createdAt: "2026-06-01T00:00:00.123Z",
        updatedAt: "2026-06-02T00:00:00+02:00",
        latestMessageRole: "assistant",
        latestTurnStatus: "future_state"
      ),
    ])

    #expect(try JSONDecoder().decode(MobileConversationListResponse.self, from: fixture) == expected)
    #expect(try object(JSONEncoder().encode(expected)) == object(fixture))
  }

  @Test(arguments: [
    #"{"conversation":{"id":"conv_1","createdAt":"created","updatedAt":"updated"},"messages":[],"hasMore":false}"#,
    #"{"conversation":{"id":"conv_1","title":null,"createdAt":"created","updatedAt":"updated"},"messages":[],"hasMore":false}"#,
  ])
  func emptyConversationDetailKeepsAnOptionalTitle(_ json: String) throws {
    let expected = MobileConversationDetailResponse(
      conversation: MobileConversationRecord(
        id: "conv_1", title: nil, createdAt: "created", updatedAt: "updated"
      ),
      messages: [],
      hasMore: false
    )
    #expect(try JSONDecoder().decode(MobileConversationDetailResponse.self, from: Data(json.utf8)) == expected)
    let encoded = try object(JSONEncoder().encode(expected))
    #expect((encoded["conversation"] as? NSDictionary)?["title"] == nil)
  }

  @Test(arguments: [
    #"{"id":"conv_1","createdAt":"created","updatedAt":"updated","futureField":true}"#,
    #"{"id":"conv_1","title":null,"createdAt":"created","updatedAt":"updated","latestMessageRole":null,"latestTurnStatus":null}"#,
  ])
  func missingOrNullSummaryMetadataRemainsOptional(_ json: String) throws {
    let summary = try JSONDecoder().decode(MobileConversationSummary.self, from: Data(json.utf8))
    #expect(summary == MobileConversationSummary(
      id: "conv_1",
      title: nil,
      createdAt: "created",
      updatedAt: "updated",
      latestMessageRole: nil,
      latestTurnStatus: nil
    ))
    let encoded = try object(JSONEncoder().encode(summary))
    #expect(encoded == ["id": "conv_1", "createdAt": "created", "updatedAt": "updated"] as NSDictionary)
  }

  @Test func conversationDetailPreservesMessageAndPagingFields() throws {
    let fixture = Data(#"""
    {"conversation":{"id":"conv_1","title":"Launch","createdAt":"created","updatedAt":"updated"},"messages":[{"id":"msg_1","role":"assistant","content":"Café 🎵\n@release:one[Debut]","clientMessageId":"client_1","turnId":"turn_1","turnStatus":"completed","createdAt":"2026-06-02T00:00:00.456Z","requiresWebHandoff":true}],"hasMore":true}
    """#.utf8)
    let expected = MobileConversationDetailResponse(
      conversation: MobileConversationRecord(
        id: "conv_1", title: "Launch", createdAt: "created", updatedAt: "updated"
      ),
      messages: [
        MobileConversationMessage(
          id: "msg_1",
          role: "assistant",
          content: "Café 🎵\n@release:one[Debut]",
          clientMessageId: "client_1",
          turnId: "turn_1",
          turnStatus: "completed",
          createdAt: "2026-06-02T00:00:00.456Z",
          requiresWebHandoff: true
        ),
      ],
      hasMore: true
    )

    #expect(try JSONDecoder().decode(MobileConversationDetailResponse.self, from: fixture) == expected)
    #expect(try object(JSONEncoder().encode(expected)) == object(fixture))
  }

  @Test(arguments: [
    #"{"id":"msg_1","role":"user","content":"hello","createdAt":"created","requiresWebHandoff":false,"futureField":{}}"#,
    #"{"id":"msg_1","role":"user","content":"hello","clientMessageId":null,"turnId":null,"turnStatus":null,"createdAt":"created","requiresWebHandoff":false}"#,
  ])
  func missingOrNullMessageMetadataRemainsOptional(_ json: String) throws {
    let message = try JSONDecoder().decode(MobileConversationMessage.self, from: Data(json.utf8))
    #expect(message == MobileConversationMessage(
      id: "msg_1",
      role: "user",
      content: "hello",
      clientMessageId: nil,
      turnId: nil,
      turnStatus: nil,
      createdAt: "created",
      requiresWebHandoff: false
    ))
    let encoded = try object(JSONEncoder().encode(message))
    #expect(encoded == [
      "id": "msg_1", "role": "user", "content": "hello",
      "createdAt": "created", "requiresWebHandoff": false,
    ] as NSDictionary)
  }

  @Test(arguments: [
    #"{"conversation":{"id":"conv_1","createdAt":"created","updatedAt":"updated"},"messages":[]}"#,
    #"{"conversation":{"id":"conv_1","createdAt":"created","updatedAt":"updated"},"messages":[{"id":"msg_1","role":"user","content":"hello","createdAt":"created"}],"hasMore":false}"#,
  ])
  func requiredPagingAndHandoffBooleansDoNotAcquireDefaults(_ json: String) throws {
    #expect(throws: DecodingError.self) {
      try JSONDecoder().decode(MobileConversationDetailResponse.self, from: Data(json.utf8))
    }
  }

  @Test func turnRequestsKeepExistingKeysAndOmitAbsentOptions() throws {
    let newConversation = MobileChatTurnRequest(
      conversationId: nil,
      clientTurnId: "client_turn_1",
      clientMessageId: "client_message_1",
      text: "Hello 🎵",
      source: "typed"
    )
    let continuedConversation = MobileChatTurnRequest(
      conversationId: "conv_1",
      clientTurnId: "client_turn_2",
      clientMessageId: "client_message_2",
      text: "Continue",
      source: "typed",
      chatMode: "ov"
    )
    let newFixture = Data(#"""
    {"clientTurnId":"client_turn_1","clientMessageId":"client_message_1","text":"Hello 🎵","source":"typed"}
    """#.utf8)
    let continuedFixture = Data(#"""
    {"conversationId":"conv_1","clientTurnId":"client_turn_2","clientMessageId":"client_message_2","text":"Continue","source":"typed","chatMode":"ov"}
    """#.utf8)

    #expect(try object(JSONEncoder().encode(newConversation)) == object(newFixture))
    #expect(try object(JSONEncoder().encode(continuedConversation)) == object(continuedFixture))
  }

  private func object(_ data: Data) throws -> NSDictionary {
    try #require(JSONSerialization.jsonObject(with: data) as? NSDictionary)
  }
}
