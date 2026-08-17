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
    case .smartLink: return "Smart Links"
    case .photo: return "Photos"
    case .press: return "Press"
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

  static let chips: [LibraryFilter] =
    [.all] + LibraryAssetType.allCases.map(LibraryFilter.type)
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
  /// Filters assets for the vertical feed (JOV-3637).
  static func filtered(assets: [LibraryAsset], filter: LibraryFilter) -> [LibraryAsset] {
    switch filter {
    case .all:
      return assets
    case let .type(type):
      return assets.filter { $0.type == type }
    }
  }

  /// Preview storefront feed used until a dedicated mobile library API ships.
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
      id: "lib-link-epk",
      name: "EPK Smart Link",
      type: .smartLink,
      isPublic: true,
      coverURL: nil,
      liveStatLabel: "312 clicks",
      publicURL: "https://jov.ie/l/epk"
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
