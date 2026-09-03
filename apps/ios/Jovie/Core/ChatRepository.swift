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
    let isSwitchingThread = activeConversationID != conversationID
    activeConversationID = conversationID

    // Paint cached history before the network round trip so a thread switch
    // is instant; the fetch below reconciles when it lands (JOV-5874). A cache
    // miss clears the previous thread's rows rather than leaving them under
    // the new conversation id. Re-opening the already-active thread keeps the
    // live timeline (it may hold an in-flight turn the cache has not seen).
    if isSwitchingThread, !(await hydrateConversationFromCache(conversationID)) {
      timeline = []
    }

    do {
      let detail = try await client.fetchConversation(id: conversationID, limit: 100)
      await persistCache(messages: detail.messages, conversationID: conversationID)
      // The user may have moved on while this fetch was in flight; never paint
      // a stale thread over the one they are looking at now.
      guard activeConversationID == conversationID else { return }
      timeline = detail.messages.map(timelineItem(from:))
      isOffline = false
      lastErrorMessage = nil
      donateConversationActivity(
        conversationID: conversationID,
        title: detail.conversation.title
      )
    } catch {
      guard activeConversationID == conversationID else { return }
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

    // The client publishes one event per NDJSON line, so raw chunk cadence
    // would otherwise drive one timeline mutation (and one assistant-row
    // re-parse) per token. Coalesce deltas to a bounded rate (JOV-5874).
    let coalescer = MobileChatStreamCoalescer { [weak self] batch in
      self?.apply(events: batch, clientTurnId: clientTurnId)
    }

    do {
      // Apply NDJSON events as they arrive so tokens paint before the body
      // finishes. Do not refetch list/detail here — those GETs can replace
      // this timeline and mark a successful turn offline.
      _ = try await client.sendTurn(
        MobileChatTurnRequest(
          conversationId: activeConversationID,
          clientTurnId: clientTurnId,
          clientMessageId: clientMessageId,
          text: trimmed,
          source: "typed",
          chatMode: workspace.chatMode
        )
      ) { event in
        await coalescer.ingest(event)
      }
      coalescer.flush()

      isOffline = false
      if assistantStatus(clientTurnId: clientTurnId) != .failed {
        lastErrorMessage = nil
      }
      await persistCache()
    } catch {
      coalescer.flush()
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
    if let activeConversationID,
       let cachedMessages = snapshot.messagesByConversationID[activeConversationID]
    {
      timeline = cachedMessages.map(timelineItem(from:))
    }
  }

  /// Paints the cached transcript for `conversationID`. Returns `false` on a
  /// cache miss so callers can decide what to show while the network loads.
  @discardableResult
  private func hydrateConversationFromCache(_ conversationID: String) async -> Bool {
    guard
      let snapshot = await cache.load(for: userID, workspace: workspace),
      let cachedMessages = snapshot.messagesByConversationID[conversationID]
    else {
      return false
    }
    timeline = cachedMessages.map(timelineItem(from:))
    return true
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

/// Batches raw NDJSON stream events into bounded-rate timeline mutations.
///
/// `MobileChatClient` publishes one event per newline, so without this every
/// server chunk would mutate `ChatRepository.timeline` and re-parse the
/// assistant row on the main actor. Deltas accumulate for `window` and flush
/// together; any lifecycle event (reserved / completed / handoff / error)
/// flushes immediately so state transitions are never delayed. Mirrors the
/// web composer's `experimental_throttle` pacing (JOV-5874).
@MainActor
final class MobileChatStreamCoalescer {
  /// ~30 paints/s — smooth on device, well under the parse budget per flush.
  static let defaultWindow: Duration = .milliseconds(33)

  private let window: Duration
  private let sink: ([MobileChatStreamEvent]) -> Void
  private var pending: [MobileChatStreamEvent] = []
  private var flushTask: Task<Void, Never>?
  /// Number of batches delivered to `sink`. Exposed for tests.
  private(set) var flushCount = 0

  init(
    window: Duration = MobileChatStreamCoalescer.defaultWindow,
    sink: @escaping ([MobileChatStreamEvent]) -> Void
  ) {
    self.window = window
    self.sink = sink
  }

  func ingest(_ event: MobileChatStreamEvent) {
    pending.append(event)
    guard case .assistantDelta = event else {
      flush()
      return
    }
    guard flushTask == nil else { return }
    let window = self.window
    flushTask = Task { [weak self] in
      try? await Task.sleep(for: window)
      guard !Task.isCancelled else { return }
      self?.flush()
    }
  }

  /// Delivers everything buffered so far. Safe to call repeatedly; a no-op
  /// when nothing is pending.
  func flush() {
    flushTask?.cancel()
    flushTask = nil
    guard !pending.isEmpty else { return }
    let batch = pending
    pending.removeAll(keepingCapacity: true)
    flushCount += 1
    sink(batch)
  }
}
