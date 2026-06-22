import Foundation

@MainActor
@Observable
final class ChatRepository {
  private(set) var conversations: [MobileConversationSummary] = []
  private(set) var timeline: [MobileChatTimelineItem] = []
  private(set) var activeConversationID: String?
  private(set) var isLoadingConversations = false
  private(set) var isSending = false
  private(set) var isOffline = false
  private(set) var lastErrorMessage: String?

  private let client: MobileChatClientProtocol
  private let cache: ChatCache
  private let clerkUserID: String
  private let webBaseURL: URL

  init(
    client: MobileChatClientProtocol,
    cache: ChatCache,
    clerkUserID: String,
    webBaseURL: URL
  ) {
    self.client = client
    self.cache = cache
    self.clerkUserID = clerkUserID
    self.webBaseURL = webBaseURL
  }

  func bootstrap() async {
    await hydrateFromCache()
  }

  func refreshConversations() async {
    isLoadingConversations = true
    defer { isLoadingConversations = false }

    do {
      let fetched = try await client.listConversations(limit: 20)
      conversations = fetched
      isOffline = false
      lastErrorMessage = nil
      await persistCache()
    } catch {
      await hydrateFromCache()
      isOffline = true
      lastErrorMessage = error.localizedDescription
    }
  }

  func openConversation(_ conversationID: String) async {
    activeConversationID = conversationID
    await hydrateConversationFromCache(conversationID)

    do {
      let detail = try await client.fetchConversation(id: conversationID, limit: 100)
      timeline = detail.messages.map(timelineItem(from:))
      isOffline = false
      lastErrorMessage = nil
      await persistCache(messages: detail.messages, conversationID: conversationID)
    } catch {
      await hydrateConversationFromCache(conversationID)
      isOffline = true
      lastErrorMessage = error.localizedDescription
    }
  }

  func startNewConversation() {
    activeConversationID = nil
    timeline = []
    lastErrorMessage = nil
  }

  func send(text: String) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !isSending else { return }

    let clientTurnId = UUID().uuidString
    let clientMessageId = UUID().uuidString

    timeline.append(
      MobileChatTimelineItem(
        id: "user:\(clientTurnId)",
        role: .user,
        content: trimmed,
        status: .completed,
        clientTurnId: clientTurnId,
        requiresWebHandoff: false,
        handoffURL: nil
      )
    )
    timeline.append(
      MobileChatTimelineItem(
        id: "assistant:\(clientTurnId)",
        role: .assistant,
        content: "",
        status: .sending,
        clientTurnId: clientTurnId,
        requiresWebHandoff: false,
        handoffURL: nil
      )
    )

    isSending = true
    defer { isSending = false }

    do {
      let events = try await client.sendTurn(
        MobileChatTurnRequest(
          conversationId: activeConversationID,
          clientTurnId: clientTurnId,
          clientMessageId: clientMessageId,
          text: trimmed,
          source: "typed"
        )
      )

      isOffline = false
      lastErrorMessage = nil
      apply(events: events, clientTurnId: clientTurnId)
      await refreshConversations()
      if let conversationID = activeConversationID ?? resolvedConversationID(from: events) {
        await openConversation(conversationID)
      }
    } catch {
      markAssistantFailed(clientTurnId: clientTurnId, message: error.localizedDescription)
      isOffline = true
      lastErrorMessage = error.localizedDescription
      await persistCache()
    }
  }

  func retry(clientTurnId: String) async {
    guard let userItem = timeline.first(where: {
      $0.clientTurnId == clientTurnId && $0.role == .user
    }) else {
      return
    }

    timeline.removeAll { $0.clientTurnId == clientTurnId }
    await send(text: userItem.content)
  }

  private func apply(events: [MobileChatStreamEvent], clientTurnId: String) {
    for event in events {
      switch event {
      case let .turnReserved(conversationId, _, _):
        activeConversationID = conversationId
        updateAssistant(clientTurnId: clientTurnId) { item in
          var updated = item
          updated.status = .streaming
          return updated
        }

      case let .assistantDelta(clientTurnId, text):
        updateAssistant(clientTurnId: clientTurnId) { item in
          var updated = item
          updated.status = .streaming
          updated.content += text
          return updated
        }

      case let .assistantCompleted(clientTurnId, conversationId, _, text):
        activeConversationID = conversationId
        updateAssistant(clientTurnId: clientTurnId) { item in
          var updated = item
          updated.status = .completed
          updated.content = text
          return updated
        }

      case let .webHandoff(clientTurnId, conversationId, url, summary):
        activeConversationID = conversationId
        updateAssistant(clientTurnId: clientTurnId) { item in
          var updated = item
          updated.status = .completed
          updated.content = summary
          updated.requiresWebHandoff = true
          updated.handoffURL = url
          return updated
        }

      case let .error(_, message):
        markAssistantFailed(clientTurnId: clientTurnId, message: message)
      }
    }
  }

  private func resolvedConversationID(from events: [MobileChatStreamEvent]) -> String? {
    for event in events {
      switch event {
      case let .turnReserved(conversationId, _, _):
        return conversationId
      case let .assistantCompleted(_, conversationId, _, _):
        return conversationId
      case let .webHandoff(_, conversationId, _, _):
        return conversationId
      default:
        continue
      }
    }
    return nil
  }

  private func markAssistantFailed(clientTurnId: String, message: String) {
    updateAssistant(clientTurnId: clientTurnId) { item in
      var updated = item
      updated.status = .failed
      updated.content = message
      return updated
    }
    lastErrorMessage = message
  }

  private func updateAssistant(
    clientTurnId: String,
    transform: (MobileChatTimelineItem) -> MobileChatTimelineItem
  ) {
    guard let index = timeline.firstIndex(where: {
      $0.clientTurnId == clientTurnId && $0.role == .assistant
    }) else {
      return
    }
    timeline[index] = transform(timeline[index])
  }

  private func hydrateFromCache() async {
    guard let snapshot = await cache.load(for: clerkUserID) else { return }
    conversations = snapshot.conversations
    if let activeConversationID,
       let cachedMessages = snapshot.messagesByConversationID[activeConversationID]
    {
      timeline = cachedMessages.map(timelineItem(from:))
    }
  }

  private func hydrateConversationFromCache(_ conversationID: String) async {
    guard
      let snapshot = await cache.load(for: clerkUserID),
      let cachedMessages = snapshot.messagesByConversationID[conversationID]
    else {
      return
    }
    timeline = cachedMessages.map(timelineItem(from:))
  }

  private func persistCache(
    messages: [MobileConversationMessage]? = nil,
    conversationID: String? = nil
  ) async {
    var messagesByConversationID =
      (await cache.load(for: clerkUserID))?.messagesByConversationID ?? [:]

    if let messages, let conversationID {
      messagesByConversationID[conversationID] = messages
    } else if let activeConversationID {
      messagesByConversationID[activeConversationID] = timeline.map(Self.message(from:))
    }

    let snapshot = CachedChatSnapshot(
      conversations: conversations,
      messagesByConversationID: messagesByConversationID,
      cachedAt: Date()
    )
    await cache.store(snapshot, for: clerkUserID)
  }

  private func timelineItem(from message: MobileConversationMessage) -> MobileChatTimelineItem {
    let handoffURL = message.requiresWebHandoff
      ? webBaseURL.appending(path: "/app/chat/\(activeConversationID ?? "")")
      : nil

    return MobileChatTimelineItem(
      id: message.id,
      role: MobileChatTimelineRole(rawValue: message.role) ?? .assistant,
      content: message.content,
      status: .completed,
      clientTurnId: message.clientMessageId,
      requiresWebHandoff: message.requiresWebHandoff,
      handoffURL: handoffURL
    )
  }

  private static func message(from item: MobileChatTimelineItem) -> MobileConversationMessage {
    MobileConversationMessage(
      id: item.id,
      role: item.role.rawValue,
      content: item.content,
      clientMessageId: item.clientTurnId,
      turnId: nil,
      turnStatus: item.status == .failed ? "failed" : "completed",
      createdAt: ISO8601DateFormatter().string(from: Date()),
      requiresWebHandoff: item.requiresWebHandoff
    )
  }
}
