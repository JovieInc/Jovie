import Foundation

actor ChatCache {
  private var memory: [String: CachedChatSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func load(
    for userID: String,
    workspace: MobileWorkspaceMode = .jovie
  ) -> CachedChatSnapshot? {
    let key = cacheKey(for: userID, workspace: workspace)
    if let snapshot = memory[key] {
      return snapshot
    }

    guard
      let data = defaults.data(forKey: key),
      let snapshot = try? decoder.decode(CachedChatSnapshot.self, from: data)
    else {
      return nil
    }

    memory[key] = snapshot
    return snapshot
  }

  func store(
    _ snapshot: CachedChatSnapshot,
    for userID: String,
    workspace: MobileWorkspaceMode = .jovie
  ) {
    let key = cacheKey(for: userID, workspace: workspace)
    memory[key] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: key)
    }
  }

  func remove(for userID: String) {
    remove(for: userID, workspace: .jovie)
    remove(for: userID, workspace: .ovie)
  }

  func remove(for userID: String, workspace: MobileWorkspaceMode) {
    let key = cacheKey(for: userID, workspace: workspace)
    memory[key] = nil
    defaults.removeObject(forKey: key)
  }

  private func cacheKey(for userID: String, workspace: MobileWorkspaceMode) -> String {
    switch workspace {
    case .jovie:
      return "ie.jov.Jovie.mobileChat.\(userID)"
    case .ovie:
      return "ie.jov.Jovie.mobileChat.\(userID).ov"
    }
  }
}
