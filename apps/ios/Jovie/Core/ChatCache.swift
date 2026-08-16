import Foundation

actor ChatCache {
  private var memory: [String: CachedChatSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func load(for userID: String) -> CachedChatSnapshot? {
    if let snapshot = memory[userID] {
      return snapshot
    }

    guard
      let data = defaults.data(forKey: cacheKey(for: userID)),
      let snapshot = try? decoder.decode(CachedChatSnapshot.self, from: data)
    else {
      return nil
    }

    memory[userID] = snapshot
    return snapshot
  }

  func store(_ snapshot: CachedChatSnapshot, for userID: String) {
    memory[userID] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: cacheKey(for: userID))
    }
  }

  func remove(for userID: String) {
    memory[userID] = nil
    defaults.removeObject(forKey: cacheKey(for: userID))
  }

  private func cacheKey(for userID: String) -> String {
    "ie.jov.Jovie.mobileChat.\(userID)"
  }
}
