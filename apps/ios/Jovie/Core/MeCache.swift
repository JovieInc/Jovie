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

  func load(for clerkUserID: String) -> CachedMeSnapshot? {
    if let snapshot = memory[clerkUserID] {
      return snapshot
    }

    guard
      let data = defaults.data(forKey: cacheKey(for: clerkUserID)),
      let snapshot = try? decoder.decode(CachedMeSnapshot.self, from: data)
    else {
      return nil
    }

    memory[clerkUserID] = snapshot
    return snapshot
  }

  func store(_ response: MobileMeResponse, for clerkUserID: String) {
    let snapshot = CachedMeSnapshot(response: response, cachedAt: Date())
    memory[clerkUserID] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: cacheKey(for: clerkUserID))
    }
  }

  private func cacheKey(for clerkUserID: String) -> String {
    "ie.jov.Jovie.mobileMe.\(clerkUserID)"
  }
}
