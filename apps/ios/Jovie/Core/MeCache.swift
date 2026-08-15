import Foundation

struct CachedMeSnapshot: Codable, Equatable, Sendable {
  let response: MobileMeResponse
  let cachedAt: Date
}

actor MeCache {
  private var memory: [String: CachedMeSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func load(for userID: String) -> CachedMeSnapshot? {
    if let snapshot = memory[userID] {
      return snapshot
    }

    guard
      let data = defaults.data(forKey: cacheKey(for: userID)),
      let snapshot = try? decoder.decode(CachedMeSnapshot.self, from: data)
    else {
      return nil
    }

    memory[userID] = snapshot
    return snapshot
  }

  func store(_ response: MobileMeResponse, for userID: String) {
    let snapshot = CachedMeSnapshot(response: response, cachedAt: Date())
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
    "ie.jov.Jovie.mobileMe.\(userID)"
  }
}
