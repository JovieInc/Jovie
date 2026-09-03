import Foundation

/// Terminal chat auth: missing token or a 401 after retry. Not a transport outage.
func isTerminalChatAuthFailure(_ error: Error) -> Bool {
  if case APIClientError.missingToken = error {
    return true
  }
  if case APIClientError.requestFailed(statusCode: 401) = error {
    return true
  }
  if case MobileChatClientError.requestFailed(statusCode: 401) = error {
    return true
  }
  return false
}

@MainActor
@Observable
final class ChatRepository {
  private(set) var conversations: [MobileConversationSummary] = []
  private(set) var timeline: [MobileChatTimelineItem] = []
  private(set) var activeConversationID: String?
  private(set) var isLoadingConversations = false
  private(set) var isSending = false
  private(set) var isLoadingOlder = false
  private(set) var hasMoreOlder = false
  private(set) var isOffline = false
  private(set) var sessionExpired = false
  private(set) var lastErrorMessage: String?
  private var olderCursor: String?
  private var sendGeneration = 0

  private let client: MobileChatClientProtocol
  private let cache: ChatCache
  private let userID: String
  private let webBaseURL: URL
  let workspace: MobileWorkspaceMode
  private let activityDonator: (any ConversationActivityDonating)?

  /// Set by `seedTimelineForUITesting`. When `true`, network-backed methods
  /// (`refreshConversations`, and any future live-fetch entry point) no-op
  /// instead of calling `client` -- the fixture launch mode has no live
  /// Better Auth session. `MobileChatView`
  /// unconditionally calls `refreshConversations()` in a `.task` on
  /// appear, so this can't be solved by the call site alone.
  private var isFixtureSeeded = false

  init(
    client: MobileChatClientProtocol,
    cache: ChatCache,
    userID: String,
    webBaseURL: URL,
    workspace: MobileWorkspaceMode = .jovie,
    activityDonator: (any ConversationActivityDonating)? = LiveConversationActivityDonator()
  ) {
    self.client = client
    self.cache = cache
    self.userID = userID
    self.webBaseURL = webBaseURL
    self.workspace = workspace
    self.activityDonator = activityDonator
  }

  func bootstrap() async {
    await hydrateFromCache()
  }

  func refreshConversations() async {
    guard !isFixtureSeeded else { return }

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
      applyFailure(error)
    }
  }

  func openConversation(_ conversationID: String) async {
    activeConversationID = conversationID
    await paintCachedWindow(conversationID)

    do {
      let detail = try await client.fetchConversation(
        id: conversationID,
        limit: ChatTranscriptWindow.initialMessageLimit,
        before: nil
      )
      guard activeConversationID == conversationID else { return }
      let hasInFlightTurn = timeline.contains {
        $0.status == .sending || $0.status == .streaming
      }
      if !hasInFlightTurn {
        applyFetchedWindow(detail.messages, hasMore: detail.hasMore)
        await persistCache(messages: detail.messages, conversationID: conversationID)
      }
      isOffline = false
      lastErrorMessage = nil
      donateConversationActivity(
        conversationID: conversationID,
        title: detail.conversation.title
      )
    } catch {
      if timeline.isEmpty {
        await hydrateConversationFromCache(conversationID)
      }
      applyFailure(error)
      donateConversationActivity(
        conversationID: conversationID,
        title: conversations.first(where: { $0.id == conversationID })?.title
      )
    }
  }

  func loadOlderMessages() async {
    guard
      hasMoreOlder,
      !isLoadingOlder,
      let conversationID = activeConversationID,
      let olderCursor,
      !olderCursor.isEmpty
    else { return }

    isLoadingOlder = true
    defer { isLoadingOlder = false }

    do {
      let detail = try await client.fetchConversation(
        id: conversationID,
        limit: ChatTranscriptWindow.initialMessageLimit,
        before: olderCursor
      )
      guard activeConversationID == conversationID else { return }
      prependFetchedWindow(detail.messages, hasMore: detail.hasMore)
      isOffline = false
      lastErrorMessage = nil
      await persistCache()
    } catch {
      applyFailure(error)
    }
  }

  func startNewConversation() {
    activeConversationID = nil
    timeline = []
    hasMoreOlder = false
    olderCursor = nil
    lastErrorMessage = nil
  }

  /// Seeds a deterministic, in-memory timeline for UI-testing launch modes
  /// only -- never called on `.live`. Bypasses the network client and cache
  /// entirely so fixture content (e.g. entity/skill chip transcripts for
  /// JOV-3608) renders without depending on a mocked backend. Callers gate
  /// this on `LaunchMode`; this method itself performs no gating so it stays
  /// trivially testable in isolation.
  func seedTimelineForUITesting(
    _ timeline: [MobileChatTimelineItem],
    activeConversationID: String
  ) {
    isFixtureSeeded = true
    self.activeConversationID = activeConversationID
    self.timeline = timeline
    hasMoreOlder = false
    olderCursor = nil
    isOffline = false
    lastErrorMessage = nil
  }

  func send(text: String) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    let wasSending = isSending
    sendGeneration += 1
    let generation = sendGeneration
    if wasSending {
      interruptInFlightAssistantRows()
    }

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
    defer {
      if generation == sendGeneration {
        isSending = false
      }
    }

    do {
      // Apply each NDJSON event as it arrives so tokens paint before the
      // body finishes. Do not refetch list/detail here — those GETs can
      // replace this timeline and mark a successful turn offline.
      _ = try await client.sendTurn(
        MobileChatTurnRequest(
          conversationId: activeConversationID,
          clientTurnId: clientTurnId,
          clientMessageId: clientMessageId,
          text: trimmed,
          source: "typed",
          chatMode: workspace.chatMode
        )
      ) { [weak self] event in
        await self?.applyIfCurrent(
          generation: generation,
          events: [event],
          clientTurnId: clientTurnId
        )
      }

      guard generation == sendGeneration else { return }
      isOffline = false
      if assistantStatus(clientTurnId: clientTurnId) != .failed {
        lastErrorMessage = nil
      }
      await persistCache()
    } catch {
      guard generation == sendGeneration else { return }
      applySendFailure(error, clientTurnId: clientTurnId)
      await persistCache()
    }
  }

  @discardableResult
  func submitEyesFreeCapture(
    transcript: String,
    destination: EyesFreeCaptureDestination,
    idempotencyKey: String
  ) async -> String {
    let trimmed = VoiceMemoActionDraft.make(fromTranscript: transcript)
    guard VoiceMemoActionDraft.isReady(trimmed), !isSending else {
      return EyesFreeCaptureGate.transcriptionEmpty.message
    }

    let clientMessageId = "\(idempotencyKey):msg"
    timeline.removeAll { $0.clientTurnId == idempotencyKey }
    timeline.append(
      MobileChatTimelineItem(
        id: "user:\(idempotencyKey)",
        role: .user,
        content: trimmed,
        status: .completed,
        clientTurnId: idempotencyKey,
        requiresWebHandoff: false,
        handoffURL: nil
      )
    )
    timeline.append(
      MobileChatTimelineItem(
        id: "assistant:\(idempotencyKey)",
        role: .assistant,
        content: "",
        status: .sending,
        clientTurnId: idempotencyKey,
        requiresWebHandoff: false,
        handoffURL: nil
      )
    )

    isSending = true
    defer { isSending = false }

    do {
      let response = try await client.submitEyesFreeCapture(
        EyesFreeCaptureAPIRequest(
          destination: destination.rawValue,
          transcript: trimmed,
          clientTurnId: idempotencyKey,
          clientMessageId: clientMessageId
        )
      )
      let failed = ["failed", "forbidden", "unavailable"].contains(response.status)
      applyEyesFreeResponse(response, clientTurnId: idempotencyKey, failed: failed)
      isOffline = response.status == "failed"
      if !failed { lastErrorMessage = nil }
      await persistCache()
      return response.readback
    } catch {
      applySendFailure(error, clientTurnId: idempotencyKey)
      await persistCache()
      return lastErrorMessage ?? EyesFreeCaptureGate.retryMessage
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

  private func applyFailure(_ error: Error) {
    if isTerminalChatAuthFailure(error) {
      sessionExpired = true
      isOffline = false
      lastErrorMessage = nil
      return
    }

    isOffline = true
    lastErrorMessage = error.localizedDescription
  }

  private func applySendFailure(_ error: Error, clientTurnId: String) {
    if isTerminalChatAuthFailure(error) {
      if assistantStatus(clientTurnId: clientTurnId) != .completed {
        markAssistantFailed(clientTurnId: clientTurnId, message: error.localizedDescription)
      }
      sessionExpired = true
      isOffline = false
      lastErrorMessage = nil
      return
    }

    if assistantStatus(clientTurnId: clientTurnId) != .completed {
      markAssistantFailed(clientTurnId: clientTurnId, message: error.localizedDescription)
      isOffline = true
    } else {
      lastErrorMessage = error.localizedDescription
    }
  }

  private func applyEyesFreeResponse(
    _ response: EyesFreeCaptureAPIResponse,
    clientTurnId: String,
    failed: Bool
  ) {
    if let conversationId = response.conversationId {
      activeConversationID = conversationId
    }
    updateAssistant(clientTurnId: clientTurnId) { item in
      var updated = item
      updated.content = response.readback
      updated.status = failed ? .failed : .completed
      return updated
    }
    if failed {
      lastErrorMessage = response.readback
    }
  }

  private func applyIfCurrent(
    generation: Int,
    events: [MobileChatStreamEvent],
    clientTurnId: String
  ) {
    guard generation == sendGeneration else { return }
    apply(events: events, clientTurnId: clientTurnId)
  }

  private func apply(events: [MobileChatStreamEvent], clientTurnId: String) {
    var pendingDeltas: [String: String] = [:]

    func flushDelta(for turnID: String) {
      guard let text = pendingDeltas.removeValue(forKey: turnID), !text.isEmpty else { return }
      updateAssistant(clientTurnId: turnID) { item in
        var updated = item
        updated.status = .streaming
        updated.content += text
        return updated
      }
    }

    for event in events {
      switch event {
      case let .turnReserved(conversationId, _, _):
        activeConversationID = conversationId
        updateAssistant(clientTurnId: clientTurnId) { item in
          var updated = item
          updated.status = .streaming
          return updated
        }

      case let .assistantDelta(eventClientTurnId, text):
        pendingDeltas[eventClientTurnId, default: ""] += text

      case let .assistantCompleted(eventClientTurnId, conversationId, _, text):
        flushDelta(for: eventClientTurnId)
        activeConversationID = conversationId
        updateAssistant(clientTurnId: eventClientTurnId) { item in
          var updated = item
          updated.status = .completed
          updated.content = text
          return updated
        }

      case let .webHandoff(eventClientTurnId, conversationId, url, summary):
        flushDelta(for: eventClientTurnId)
        activeConversationID = conversationId
        updateAssistant(clientTurnId: eventClientTurnId) { item in
          var updated = item
          updated.status = .completed
          updated.content = summary
          updated.requiresWebHandoff = true
          updated.handoffURL = url
          return updated
        }

      case let .error(_, message):
        flushDelta(for: clientTurnId)
        markAssistantFailed(clientTurnId: clientTurnId, message: message)
      }
    }

    for eventClientTurnId in Array(pendingDeltas.keys) {
      flushDelta(for: eventClientTurnId)
    }
  }

  private func assistantStatus(clientTurnId: String) -> MobileChatTimelineStatus? {
    timeline.first { $0.clientTurnId == clientTurnId && $0.role == .assistant }?.status
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
    guard let snapshot = await cache.load(for: userID, workspace: workspace) else { return }
    conversations = snapshot.conversations
    if let activeConversationID {
      await paintCachedWindow(activeConversationID, snapshot: snapshot)
    }
  }

  private func hydrateConversationFromCache(_ conversationID: String) async {
    await paintCachedWindow(conversationID)
  }

  private func paintCachedWindow(
    _ conversationID: String,
    snapshot: CachedChatSnapshot? = nil
  ) async {
    let loaded = snapshot ?? (await cache.load(for: userID, workspace: workspace))
    guard let cachedMessages = loaded?.messagesByConversationID[conversationID] else {
      return
    }
    applyFetchedWindow(
      ChatTranscriptWindow.visibleTail(cachedMessages),
      hasMore: ChatTranscriptWindow.hasOlderHistory(
        cachedCount: cachedMessages.count,
        fetchedHasMore: false
      )
    )
  }

  private func applyFetchedWindow(
    _ messages: [MobileConversationMessage],
    hasMore: Bool
  ) {
    timeline = messages.map(timelineItem(from:))
    olderCursor = messages.first?.createdAt
    hasMoreOlder = hasMore
  }

  private func prependFetchedWindow(
    _ messages: [MobileConversationMessage],
    hasMore: Bool
  ) {
    let existingIDs = Set(timeline.map(\.id))
    let incoming = messages.filter { !existingIDs.contains($0.id) }
    timeline.insert(contentsOf: incoming.map(timelineItem(from:)), at: 0)
    olderCursor = (incoming.first ?? messages.first)?.createdAt ?? olderCursor
    hasMoreOlder = hasMore
  }

  private func interruptInFlightAssistantRows() {
    timeline.removeAll {
      $0.role == .assistant
        && ($0.status == .sending || $0.status == .streaming)
        && $0.content.isEmpty
    }
    for index in timeline.indices {
      let item = timeline[index]
      guard
        item.role == .assistant,
        item.status == .sending || item.status == .streaming
      else { continue }
      var updated = item
      updated.status = .completed
      timeline[index] = updated
    }
  }

  private func persistCache(
    messages: [MobileConversationMessage]? = nil,
    conversationID: String? = nil
  ) async {
    var messagesByConversationID =
      (await cache.load(for: userID, workspace: workspace))?.messagesByConversationID ?? [:]

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
    await cache.store(snapshot, for: userID, workspace: workspace)
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

  private func donateConversationActivity(conversationID: String, title: String?) {
    guard let activityDonator else { return }

    activityDonator.donate(
      conversationID: conversationID,
      title: ConversationUserActivity.displayTitle(for: title)
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
