import Foundation

actor ChatCache {
  private var memory: [String: CachedChatSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func load(for clerkUserID: String) -> CachedChatSnapshot? {
    if let snapshot = memory[clerkUserID] {
      return snapshot
    }

    guard
      let data = defaults.data(forKey: cacheKey(for: clerkUserID)),
      let snapshot = try? decoder.decode(CachedChatSnapshot.self, from: data)
    else {
      return nil
    }

    memory[clerkUserID] = snapshot
    return snapshot
  }

  func store(_ snapshot: CachedChatSnapshot, for clerkUserID: String) {
    memory[clerkUserID] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: cacheKey(for: clerkUserID))
    }
  }

  func remove(for clerkUserID: String) {
    memory[clerkUserID] = nil
    defaults.removeObject(forKey: cacheKey(for: clerkUserID))
  }

  private func cacheKey(for clerkUserID: String) -> String {
    "ie.jov.Jovie.mobileChat.\(clerkUserID)"
  }
}