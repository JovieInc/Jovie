import Foundation
import Observation

/// Each home surface revalidates independently. A slow Audience or Calendar
/// request must never delay a cached paint or a completed Inbox response.
protocol MobileHomeDataClient: Sendable {
  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse
  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse
  func fetchActionLoopInbox(workspace: MobileWorkspaceMode) async throws -> MobileActionLoopInboxResponse
}

extension APIClient: MobileHomeDataClient {}

@MainActor
@Observable
final class MobileHomeDataStore {
  private(set) var audienceState: AudienceHighlightsLoadState = .idle
  private(set) var calendar: MobileActionLoopCalendarResponse?
  private(set) var inbox: MobileActionLoopInboxResponse?
  private(set) var isLoadingCalendar = false
  private(set) var isLoadingInbox = false

  private struct Context: Equatable {
    let userID: String
    let workspace: MobileWorkspaceMode
  }

  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var actionLoopCache: ActionLoopCache
  @ObservationIgnored private var audienceCache: AudienceHighlightsCache
  @ObservationIgnored private var context: Context?
  @ObservationIgnored private var requestID: UUID?
  @ObservationIgnored private var decidedCardIDs: Set<String> = []

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    actionLoopCache = ActionLoopCache(defaults: defaults)
    audienceCache = AudienceHighlightsCache(defaults: defaults)
  }

  /// Called synchronously at account/workspace/route changes, before a new
  /// task can paint. Invalidates old completions even if transport ignores
  /// cancellation. Never reuse another account's in-memory cache.
  func setContext(userID: String?, workspace: MobileWorkspaceMode) {
    let next = userID.map { Context(userID: $0, workspace: workspace) }
    guard next != context else { return }
    requestID = nil
    if next?.userID != context?.userID {
      calendar = nil
      audienceState = .idle
      actionLoopCache = ActionLoopCache(defaults: defaults)
      audienceCache = AudienceHighlightsCache(defaults: defaults)
    }
    inbox = nil
    decidedCardIDs = []
    isLoadingCalendar = false
    isLoadingInbox = false
    context = next
  }

  func showFixture(
    audience: AudienceHighlightsLoadState,
    calendar: MobileActionLoopCalendarResponse?,
    inbox: MobileActionLoopInboxResponse?,
    isLoadingCalendar: Bool = false,
    isLoadingInbox: Bool = false
  ) {
    requestID = nil
    audienceState = audience
    self.calendar = calendar
    self.inbox = inbox
    self.isLoadingCalendar = isLoadingCalendar
    self.isLoadingInbox = isLoadingInbox
  }

  func reload(userID: String, workspace: MobileWorkspaceMode, client: any MobileHomeDataClient) async {
    guard !Task.isCancelled else { return }
    setContext(userID: userID, workspace: workspace)
    // Retry taps and startup share one flight per account/workspace.
    guard requestID == nil else { return }
    let request = UUID()
    requestID = request
    defer {
      if requestID == request {
        requestID = nil
        isLoadingCalendar = false
        isLoadingInbox = false
        if audienceState == .loading { audienceState = .idle }
      }
    }

    async let audience: Void = reloadAudience(userID: userID, client: client, request: request)
    async let calendar: Void = reloadCalendar(userID: userID, client: client, request: request)
    async let inbox: Void = reloadInbox(userID: userID, workspace: workspace, client: client, request: request)
    _ = await (audience, calendar, inbox)
  }

  func removeDecidedCard(_ cardID: String, userID: String, workspace: MobileWorkspaceMode) async {
    guard context == Context(userID: userID, workspace: workspace) else { return }
    decidedCardIDs.insert("summer-card:\(cardID)")
    guard let inbox else { return }
    let updated = excludingDecidedCards(from: inbox)
    self.inbox = updated
    await actionLoopCache.storeInbox(updated, for: userID, workspace: workspace)
  }

  private func canPublish(_ request: UUID) -> Bool {
    requestID == request && !Task.isCancelled
  }

  private func reloadAudience(userID: String, client: any MobileHomeDataClient, request: UUID) async {
    if let cached = await audienceCache.load(for: userID), canPublish(request) {
      audienceState = .loaded(cached.response)
    }
    guard canPublish(request) else { return }
    if audienceHighlightsShouldShowLoading(current: audienceState) { audienceState = .loading }
    do {
      let response = try await client.fetchAudienceHighlights()
      guard canPublish(request) else { return }
      audienceState = .loaded(response)
      await audienceCache.store(response, for: userID)
    } catch {
      guard canPublish(request) else { return }
      if case .loaded = audienceState { return }
      audienceState = .error("Couldn't load audience highlights.")
    }
  }

  private func reloadCalendar(userID: String, client: any MobileHomeDataClient, request: UUID) async {
    let cached = await actionLoopCache.loadCalendar(for: userID)
    guard canPublish(request) else { return }
    if calendar == nil { calendar = cached }
    isLoadingCalendar = calendar == nil
    defer { if requestID == request { isLoadingCalendar = false } }
    do {
      let response = try await client.fetchActionLoopCalendar()
      guard canPublish(request) else { return }
      calendar = response
      isLoadingCalendar = false
      await actionLoopCache.storeCalendar(response, for: userID)
    } catch {
      // Preserve the last successful snapshot; cancellation never becomes an error.
    }
  }

  private func reloadInbox(
    userID: String, workspace: MobileWorkspaceMode, client: any MobileHomeDataClient, request: UUID
  ) async {
    let cached = await actionLoopCache.loadInbox(for: userID, workspace: workspace)
    guard canPublish(request) else { return }
    if inbox == nil, let cached { inbox = excludingDecidedCards(from: cached) }
    isLoadingInbox = inbox == nil
    defer { if requestID == request { isLoadingInbox = false } }
    do {
      let response = try await client.fetchActionLoopInbox(workspace: workspace)
      guard canPublish(request) else { return }
      let updated = excludingDecidedCards(from: response)
      inbox = updated
      isLoadingInbox = false
      await actionLoopCache.storeInbox(updated, for: userID, workspace: workspace)
    } catch {
      // Keep cached actions visible while retry remains available.
    }
  }

  private func excludingDecidedCards(from response: MobileActionLoopInboxResponse) -> MobileActionLoopInboxResponse {
    let items = response.items.filter { !decidedCardIDs.contains($0.id) }
    return MobileActionLoopInboxResponse(
      pendingCount: max(0, response.pendingCount - (response.items.count - items.count)),
      items: items,
      emptyActionCards: response.emptyActionCards,
      chatPrompt: response.chatPrompt
    )
  }
}

struct CachedActionLoopInboxSnapshot: Codable, Equatable, Sendable {
  let response: MobileActionLoopInboxResponse
  let cachedAt: Date
}

struct CachedActionLoopCalendarSnapshot: Codable, Equatable, Sendable {
  let response: MobileActionLoopCalendarResponse
  let cachedAt: Date
}

actor ActionLoopCache {
  private var inboxMemory: [String: CachedActionLoopInboxSnapshot] = [:]
  private var calendarMemory: [String: CachedActionLoopCalendarSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func loadInbox(for userID: String, workspace: MobileWorkspaceMode = .jovie) -> MobileActionLoopInboxResponse? {
    let key = inboxCacheKey(for: userID, workspace: workspace)
    if let snapshot = inboxMemory[key] {
      return snapshot.response
    }

    guard
      let data = defaults.data(forKey: key),
      let snapshot = try? decoder.decode(CachedActionLoopInboxSnapshot.self, from: data)
    else {
      return nil
    }

    inboxMemory[key] = snapshot
    return snapshot.response
  }

  func storeInbox(_ response: MobileActionLoopInboxResponse, for userID: String, workspace: MobileWorkspaceMode = .jovie) {
    let key = inboxCacheKey(for: userID, workspace: workspace)
    let snapshot = CachedActionLoopInboxSnapshot(response: response, cachedAt: Date())
    inboxMemory[key] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: key)
    }
  }

  func loadCalendar(for userID: String) -> MobileActionLoopCalendarResponse? {
    if let snapshot = calendarMemory[userID] {
      return snapshot.response
    }

    guard
      let data = defaults.data(forKey: calendarCacheKey(for: userID)),
      let snapshot = try? decoder.decode(CachedActionLoopCalendarSnapshot.self, from: data)
    else {
      return nil
    }

    calendarMemory[userID] = snapshot
    return snapshot.response
  }

  func storeCalendar(_ response: MobileActionLoopCalendarResponse, for userID: String) {
    let snapshot = CachedActionLoopCalendarSnapshot(response: response, cachedAt: Date())
    calendarMemory[userID] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: calendarCacheKey(for: userID))
    }
  }

  func remove(for userID: String) {
    calendarMemory[userID] = nil
    defaults.removeObject(forKey: calendarCacheKey(for: userID))
    removeInbox(for: userID, workspace: .jovie)
    removeInbox(for: userID, workspace: .ovie)
  }

  private func removeInbox(for userID: String, workspace: MobileWorkspaceMode) {
    let key = inboxCacheKey(for: userID, workspace: workspace)
    inboxMemory[key] = nil
    defaults.removeObject(forKey: key)
  }

  private func inboxCacheKey(for userID: String, workspace: MobileWorkspaceMode) -> String {
    workspace == .ovie
      ? "ie.jov.Jovie.actionLoopInbox.\(userID).ov"
      : "ie.jov.Jovie.actionLoopInbox.\(userID)"
  }

  private func calendarCacheKey(for userID: String) -> String {
    "ie.jov.Jovie.actionLoopCalendar.\(userID)"
  }
}
