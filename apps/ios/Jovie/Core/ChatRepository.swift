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
  private(set) var isOffline = false
  private(set) var sessionExpired = false
  private(set) var lastErrorMessage: String?

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
  private var sendTask: Task<Void, Never>?

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
    if workspace == .ovie {
      if activeConversationID == nil { await refreshConversations() }
      else { await openConversation(activeConversationID!) }
    }
  }

  func cancelInFlightTurn() {
    sendTask?.cancel()
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
      if workspace == .ovie, activeConversationID == nil, let first = fetched.first {
        await openConversation(first.id)
      }
    } catch {
      await hydrateFromCache()
      applyFailure(error)
    }
  }

  func openConversation(_ conversationID: String) async {
    activeConversationID = conversationID

    do {
      let detail = try await client.fetchConversation(id: conversationID, limit: 100)
      timeline = detail.messages.map(timelineItem(from:))
      isOffline = false
      lastErrorMessage = nil
      await persistCache(messages: detail.messages, conversationID: conversationID)
      donateConversationActivity(
        conversationID: conversationID,
        title: detail.conversation.title
      )
    } catch {
      await hydrateConversationFromCache(conversationID)
      applyFailure(error)
      donateConversationActivity(
        conversationID: conversationID,
        title: conversations.first(where: { $0.id == conversationID })?.title
      )
    }
  }

  func startNewConversation() {
    activeConversationID = nil
    timeline = []
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
    isOffline = false
    lastErrorMessage = nil
  }

  func send(text: String) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !isSending else { return }
    let task = Task { [weak self] in
      await self?.performSend(text: trimmed)
    }
    sendTask = task
    await task.value
  }

  private func performSend(text: String) async {
    let clientTurnId = UUID().uuidString
    let clientMessageId = UUID().uuidString
    timeline.append(
      MobileChatTimelineItem(
        id: "user:\(clientTurnId)",
        role: .user,
        content: text,
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
        status: .queued,
        clientTurnId: clientTurnId,
        requiresWebHandoff: false,
        handoffURL: nil
      )
    )

    isSending = true
    defer { isSending = false }

    do {
      try Task.checkCancellation()
      // Apply each NDJSON event as it arrives so tokens paint before the
      // body finishes. Do not refetch list/detail here — those GETs can
      // replace this timeline and mark a successful turn offline.
      _ = try await client.sendTurn(
        MobileChatTurnRequest(
          conversationId: activeConversationID,
          clientTurnId: clientTurnId,
          clientMessageId: clientMessageId,
          text: text,
          source: "typed",
          chatMode: workspace.chatMode
        )
      ) { [weak self] event in
        await self?.apply(events: [event], clientTurnId: clientTurnId)
      }

      if Task.isCancelled {
        markAssistantCanceled(clientTurnId: clientTurnId)
      } else if assistantStatus(clientTurnId: clientTurnId)?.isInFlight == true {
        markAssistantFailed(
          clientTurnId: clientTurnId,
          message: "Summer did not confirm a terminal state for this turn."
        )
      }
      isOffline = false
      if assistantStatus(clientTurnId: clientTurnId) != .failed,
         assistantStatus(clientTurnId: clientTurnId) != .canceled
      {
        lastErrorMessage = nil
      }
      await persistCache()
    } catch is CancellationError {
      markAssistantCanceled(clientTurnId: clientTurnId)
      await persistCache()
    } catch {
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

    if case MobileChatClientError.requestFailed(statusCode: 409) = error {
      updateAssistant(clientTurnId: clientTurnId) { item in
        var updated = item
        if ![.completed, .failed, .canceled].contains(item.status) { updated.status = .retrying }
        return updated
      }
      isOffline = false
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

  private func apply(events: [MobileChatStreamEvent], clientTurnId: String) {
    var pendingDeltas: [String: String] = [:]

    func flushDelta(for turnID: String) {
      guard let text = pendingDeltas.removeValue(forKey: turnID), !text.isEmpty else { return }
      updateAssistant(clientTurnId: turnID) { item in
        if item.status == .failed || item.status == .canceled { return item }
        var updated = item
        if item.status != .completed { updated.status = .streaming }
        updated.content += text
        return updated
      }
    }

    for event in events {
      switch event {
      case let .turnReserved(conversationId, turnId, _):
        activeConversationID = conversationId
        updateAssistant(clientTurnId: clientTurnId) { item in
          var updated = item
          if item.status != .failed && item.status != .canceled && item.status != .completed {
            updated.status = .queued
          }
          updated.turnId = turnId
          return updated
        }

      case let .turnState(eventClientTurnId, state, eveWorkId):
        updateAssistant(clientTurnId: eventClientTurnId) { item in
          if item.status == .failed || item.status == .canceled || item.status == .completed {
            return item
          }
          var updated = item
          updated.status = Self.status(fromLifecycle: state) ?? item.status
          if let eveWorkId { updated.eveWorkId = eveWorkId }
          return updated
        }

      case let .assistantDelta(eventClientTurnId, text):
        pendingDeltas[eventClientTurnId, default: ""] += text

      case let .assistantCompleted(eventClientTurnId, conversationId, turnId, text):
        flushDelta(for: eventClientTurnId)
        activeConversationID = conversationId
        updateAssistant(clientTurnId: eventClientTurnId) { item in
          if item.status == .failed || item.status == .canceled { return item }
          var updated = item
          updated.status = .completed
          updated.content = text
          updated.turnId = turnId
          return updated
        }

      case let .webHandoff(eventClientTurnId, conversationId, url, summary):
        flushDelta(for: eventClientTurnId)
        activeConversationID = conversationId
        updateAssistant(clientTurnId: eventClientTurnId) { item in
          if item.status == .failed || item.status == .canceled { return item }
          var updated = item
          updated.status = .completed
          updated.content = summary
          updated.requiresWebHandoff = true
          updated.handoffURL = url
          return updated
        }

      case let .error(_, message):
        flushDelta(for: clientTurnId)
        if assistantStatus(clientTurnId: clientTurnId) != .completed {
          markAssistantFailed(clientTurnId: clientTurnId, message: message)
        } else {
          lastErrorMessage = message
        }
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
      if item.status == .completed { return item }
      var updated = item
      updated.status = .failed
      updated.content = message
      return updated
    }
    lastErrorMessage = message
  }

  private func markAssistantCanceled(clientTurnId: String) {
    updateAssistant(clientTurnId: clientTurnId) { item in
      if item.status == .completed || item.status == .failed { return item }
      var updated = item
      updated.status = .canceled
      if updated.content.isEmpty { updated.content = "Summer turn was canceled before completion." }
      return updated
    }
  }

  private static func status(fromLifecycle state: String) -> MobileChatTimelineStatus? {
    switch state {
    case "queued": return .queued
    case "running": return .running
    case "retrying": return .retrying
    case "failed": return .failed
    case "canceled": return .canceled
    case "completed": return .completed
    default: return nil
    }
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
    let conversationID = activeConversationID ?? snapshot.activeConversationID ?? snapshot.conversations.first?.id
    activeConversationID = conversationID
    if let conversationID, let cachedMessages = snapshot.messagesByConversationID[conversationID] {
      timeline = cachedMessages.map(timelineItem(from:))
    }
  }

  private func hydrateConversationFromCache(_ conversationID: String) async {
    guard
      let snapshot = await cache.load(for: userID, workspace: workspace),
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
      (await cache.load(for: userID, workspace: workspace))?.messagesByConversationID ?? [:]

    if let messages, let conversationID {
      messagesByConversationID[conversationID] = messages
    } else if let activeConversationID {
      messagesByConversationID[activeConversationID] = timeline.map(Self.message(from:))
    }

    let snapshot = CachedChatSnapshot(
      conversations: conversations,
      messagesByConversationID: messagesByConversationID,
      cachedAt: Date(),
      activeConversationID: activeConversationID
    )
    await cache.store(snapshot, for: userID, workspace: workspace)
  }

  private func timelineItem(from message: MobileConversationMessage) -> MobileChatTimelineItem {
    let handoffURL = message.requiresWebHandoff
      ? webBaseURL.appending(path: "/app/chat/\(activeConversationID ?? "")")
      : nil

    let status: MobileChatTimelineStatus = switch message.turnStatus {
    case "reserved": .queued
    case "running", "streaming": .running
    case "canceled": .canceled
    case "failed_tool_unavailable", "failed_model_error", "failed_timeout", "failed_network", "failed":
      .failed
    default: .completed
    }
    return MobileChatTimelineItem(
      id: message.id,
      role: MobileChatTimelineRole(rawValue: message.role) ?? .assistant,
      content: message.content,
      status: status,
      clientTurnId: message.clientMessageId,
      requiresWebHandoff: message.requiresWebHandoff,
      handoffURL: handoffURL,
      turnId: message.turnId
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
      turnId: item.turnId,
      turnStatus: {
        switch item.status {
        case .failed: return "failed"
        case .canceled: return "canceled"
        case .queued: return "reserved"
        case .running, .retrying, .streaming, .sending: return "streaming"
        default: return "completed"
        }
      }(),
      createdAt: ISO8601DateFormatter().string(from: Date()),
      requiresWebHandoff: item.requiresWebHandoff
    )
  }
}
