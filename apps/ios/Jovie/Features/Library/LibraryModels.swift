import Foundation

enum LibraryAssetType: String, CaseIterable, Identifiable, Sendable {
  case release
  case merch
  case smartLink
  case photo
  case press
  case video

  var id: String { rawValue }

  var title: String {
    switch self {
    case .release: return "Releases"
    case .merch: return "Merch"
    case .smartLink: return "Smart Links"
    case .photo: return "Photos"
    case .press: return "Press"
    case .video: return "Videos"
    }
  }

  var filterLabel: String {
    switch self {
    case .release: return "Releases"
    case .merch: return "Merch"
    case .smartLink: return "Links"
    case .photo: return "Photos"
    case .press: return "Docs"
    case .video: return "Videos"
    }
  }

  var singularTitle: String {
    switch self {
    case .release: return "Release"
    case .merch: return "Merch"
    case .smartLink: return "Smart Link"
    case .photo: return "Photo"
    case .press: return "Press"
    case .video: return "Video"
    }
  }
}

enum LibraryHome: String, CaseIterable, Identifiable, Sendable {
  case catalog
  case collections
  case ideas

  var id: String { rawValue }

  var title: String {
    switch self {
    case .catalog: return "Catalog"
    case .collections: return "Collections"
    case .ideas: return "Ideas"
    }
  }
}

enum LibraryFilter: Equatable, Hashable, Identifiable, Sendable {
  case all
  case type(LibraryAssetType)

  var id: String {
    switch self {
    case .all: return "all"
    case let .type(type): return type.rawValue
    }
  }

  var title: String {
    switch self {
    case .all: return "All"
    case let .type(type): return type.filterLabel
    }
  }

  /// Catalog chips only. Smart links are a property on every asset, not a type.
  static let catalogChips: [LibraryFilter] = [
    .all,
    .type(.release),
    .type(.merch),
    .type(.press),
  ]

  /// Legacy alias used by older tests. Same as `catalogChips`.
  static let chips: [LibraryFilter] = catalogChips
}

struct LibraryAsset: Identifiable, Equatable, Sendable {
  let id: String
  let name: String
  let type: LibraryAssetType
  let isPublic: Bool
  let coverURL: URL?
  let liveStatLabel: String
  let publicURL: String?
  /// On-device file for locally recorded videos (teleprompter sessions).
  /// Nil for every remote storefront asset.
  let localVideoURL: URL?

  init(
    id: String,
    name: String,
    type: LibraryAssetType,
    isPublic: Bool,
    coverURL: URL?,
    liveStatLabel: String,
    publicURL: String?,
    localVideoURL: URL? = nil
  ) {
    self.id = id
    self.name = name
    self.type = type
    self.isPublic = isPublic
    self.coverURL = coverURL
    self.liveStatLabel = liveStatLabel
    self.publicURL = publicURL
    self.localVideoURL = localVideoURL
  }

  var typeBadge: String { type.singularTitle }
  var visibilityBadge: String { isPublic ? "Public" : "Private" }

  var jovieLinkLabel: String? {
    guard let publicURL, let url = URL(string: publicURL) else { return nil }
    let host = url.host ?? ""
    let path = url.path
    if host.isEmpty { return publicURL }
    return path.count > 1 ? "\(host)\(path)" : host
  }
}

struct LibraryCollection: Identifiable, Equatable, Sendable {
  let id: String
  let name: String
  let items: [LibraryAsset]

  var count: Int { items.count }

  var subtitle: String {
    let takeWord = count == 1 ? "take" : "takes"
    return "Collection · \(count) \(takeWord)"
  }
}

/// Maps completed teleprompter sessions into Library video assets
/// (JOV-5075). Only sessions whose recording finished *and* whose video file
/// still exists on disk surface here — recording/failed sessions never leak
/// into Library.
enum LibraryVlogVideos {
  static func assets(
    from sessions: [VlogSessionRecord],
    store: VlogSessionStore,
    fileManager: FileManager = .default,
    now: Date = Date()
  ) -> [LibraryAsset] {
    sessions.compactMap { session in
      guard session.status == .completed else { return nil }
      let videoURL = store.videoURL(for: session)
      guard fileManager.fileExists(atPath: videoURL.path) else { return nil }

      return LibraryAsset(
        id: "vlog-\(session.id.uuidString)",
        name: session.scriptTitle,
        type: .video,
        isPublic: false,
        coverURL: nil,
        liveStatLabel: statLabel(for: session, now: now),
        publicURL: nil,
        localVideoURL: videoURL
      )
    }
  }

  private static func statLabel(for session: VlogSessionRecord, now: Date) -> String {
    let minutes = max(0, Int(now.timeIntervalSince(session.createdAt) / 60))
    if minutes < 1 { return "Recorded just now" }
    if minutes < 60 { return "Recorded \(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "Recorded \(hours)h ago" }
    return "Recorded \(hours / 24)d ago"
  }
}

enum LibraryFeed {
  static let catalogTypes: Set<LibraryAssetType> = [.release, .merch, .photo, .press]

  /// Filters assets for the vertical feed (JOV-3637).
  static func filtered(assets: [LibraryAsset], filter: LibraryFilter) -> [LibraryAsset] {
    switch filter {
    case .all:
      return assets
    case let .type(type):
      return assets.filter { $0.type == type }
    }
  }

  static func catalog(assets: [LibraryAsset], filter: LibraryFilter) -> [LibraryAsset] {
    let catalog = assets.filter { catalogTypes.contains($0.type) }
    return filtered(assets: catalog, filter: filter)
  }

  static func matching(_ assets: [LibraryAsset], query: String) -> [LibraryAsset] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return assets }
    return assets.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
  }

  /// Script title + matching takes become one collection so raw clips
  /// never sit on the Catalog scroll.
  static func collections(from videos: [LibraryAsset]) -> [LibraryCollection] {
    let takes = videos.filter { $0.type == .video }
    var grouped: [String: [LibraryAsset]] = [:]
    var order: [String] = []
    for take in takes {
      let key = take.name
      if grouped[key] == nil {
        order.append(key)
        grouped[key] = []
      }
      grouped[key, default: []].append(take)
    }
    return order.map { name in
      let items = grouped[name] ?? []
      return LibraryCollection(id: "collection-\(name)", name: name, items: items)
    }
  }

  static func matchingCollections(
    _ collections: [LibraryCollection],
    query: String
  ) -> [LibraryCollection] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return collections }
    return collections.filter { collection in
      collection.name.localizedCaseInsensitiveContains(trimmed)
        || collection.items.contains { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }
  }

  /// Preview storefront feed used until a dedicated mobile library API ships.
  /// Smart links are not rows. Every catalog asset already carries `publicURL`.
  static let previewAssets: [LibraryAsset] = [
    LibraryAsset(
      id: "lib-release-midnight",
      name: "Midnight Drive",
      type: .release,
      isPublic: true,
      coverURL: nil,
      liveStatLabel: "1.2k visits",
      publicURL: "https://jov.ie/a/midnight-drive"
    ),
    LibraryAsset(
      id: "lib-merch-tee",
      name: "Tour Tee",
      type: .merch,
      isPublic: true,
      coverURL: nil,
      liveStatLabel: "84 orders",
      publicURL: "https://jov.ie/a/tour-tee"
    ),
    LibraryAsset(
      id: "lib-photo-stage",
      name: "Stage Still",
      type: .photo,
      isPublic: false,
      coverURL: nil,
      liveStatLabel: "Private",
      publicURL: nil
    ),
    LibraryAsset(
      id: "lib-press-kit",
      name: "Press Kit 2026",
      type: .press,
      isPublic: false,
      coverURL: nil,
      liveStatLabel: "3 assets",
      publicURL: nil
    ),
  ]
}
