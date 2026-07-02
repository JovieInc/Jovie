import Foundation
import Testing
@testable import Jovie

@MainActor
struct ChatRepositoryTests {
  @Test func openConversationDonatesSpotlightActivity() async {
    let donator = RecordingConversationActivityDonator()
    let repository = ChatRepository(
      client: SuccessfulChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-activity")!),
      clerkUserID: "user_activity_test",
      webBaseURL: URL(string: "https://preview.example")!,
      activityDonator: donator
    )

    await repository.openConversation("conv_activity")

    #expect(donator.donations.count == 1)
    #expect(donator.donations.first?.conversationID == "conv_activity")
    #expect(donator.donations.first?.title == "Launch plan")
  }

  @Test func sendAppendsTimelineRowsAndMarksOfflineOnFailure() async {
    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo")!),
      clerkUserID: "user_repo_test",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Help me launch")

    #expect(repository.timeline.count == 2)
    #expect(repository.timeline.first?.role == .user)
    #expect(repository.timeline.last?.status == .failed)
    #expect(repository.isOffline == true)
    #expect(repository.lastErrorMessage?.isEmpty == false)
  }
}

private final class RecordingConversationActivityDonator: ConversationActivityDonating, @unchecked Sendable {
  struct Donation: Equatable {
    let conversationID: String
    let title: String
  }

  private(set) var donations: [Donation] = []

  func donate(conversationID: String, title: String) {
    donations.append(Donation(conversationID: conversationID, title: title))
  }
}

private struct SuccessfulChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    MobileConversationDetailResponse(
      conversation: MobileConversationRecord(
        id: id,
        title: "Launch plan",
        createdAt: "2026-07-02T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z"
      ),
      messages: [],
      hasMore: false
    )
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    []
  }
}

private struct FailingChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 500)
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    throw MobileChatClientError.transportFailed(code: -1009)
  }
}