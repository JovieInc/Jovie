import Foundation

enum LibraryAssetType: String, CaseIterable, Identifiable, Sendable {
  case release
  case merch
  case smartLink
  case photo
  case press

  var id: String { rawValue }

  var title: String {
    switch self {
    case .release: return "Releases"
    case .merch: return "Merch"
    case .smartLink: return "Smart Links"
    case .photo: return "Photos"
    case .press: return "Press"
    }
  }

  var filterLabel: String {
    switch self {
    case .release: return "Releases"
    case .merch: return "Merch"
    case .smartLink: return "Smart Links"
    case .photo: return "Photos"
    case .press: return "Press"
    }
  }

  var singularTitle: String {
    switch self {
    case .release: return "Release"
    case .merch: return "Merch"
    case .smartLink: return "Smart Link"
    case .photo: return "Photo"
    case .press: return "Press"
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

  var typeBadge: String { type.singularTitle }
  var visibilityBadge: String { isPublic ? "Public" : "Private" }
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
