import Foundation

enum FeatureIntroAccent: String, Equatable, Sendable, CaseIterable {
  case accent
  case blue
  case orange
}

struct FeatureIntroHighlight: Equatable, Sendable {
  let id: String
  let systemImage: String
  let title: String
  let oneLine: String
  let ctaTitle: String
}

struct FeatureIntroBullet: Equatable, Sendable, Identifiable {
  let id: String
  let text: String
  let accent: FeatureIntroAccent
}

enum FeatureIntroVisibleRow: Equatable, Sendable, Identifiable {
  case bullet(FeatureIntroBullet)
  case andMore

  var id: String {
    switch self {
    case .bullet(let bullet):
      return bullet.id
    case .andMore:
      return "and-more"
    }
  }
}

struct FeatureIntroCatalog: Equatable, Sendable {
  let highlight: FeatureIntroHighlight?
  let whatsNewID: String
  let whatsNewItems: [FeatureIntroBullet]

  static let current = FeatureIntroCatalog(
    highlight: FeatureIntroHighlight(
      id: "ios-catalog-in-chat",
      systemImage: "sparkles",
      title: "Your Catalog Is Already In Chat",
      oneLine: "Ask about a release, a show, or the next move.",
      ctaTitle: "Ask Something"
    ),
    whatsNewID: "ios-2026-08",
    whatsNewItems: [
      FeatureIntroBullet(
        id: "talk-home",
        text: "Talk from the home screen.",
        accent: .accent
      ),
      FeatureIntroBullet(
        id: "one-shell",
        text: "Library, Calendar, and Inbox stay together.",
        accent: .blue
      ),
      FeatureIntroBullet(
        id: "profile-setup",
        text: "Profile setup stays on iPhone.",
        accent: .orange
      ),
      FeatureIntroBullet(
        id: "signin-recover",
        text: "Canceled sign-in is recoverable.",
        accent: .accent
      ),
    ]
  )

  static func changelogURL(from webBaseURL: URL) -> URL {
    webBaseURL.appending(path: "changelog")
  }
}

enum FeatureIntroKind: Equatable, Sendable {
  case highlight(FeatureIntroHighlight)
  case whatsNew(id: String, rows: [FeatureIntroVisibleRow])
}

enum FeatureIntroStorage {
  static let dismissedHighlightIDKey = "jovie.featureIntro.dismissedHighlightID"
  static let dismissedWhatsNewIDKey = "jovie.featureIntro.dismissedWhatsNewID"
}

enum FeatureIntroPresentation {
  static let maxWhatsNewRows = 3

  static func visibleWhatsNewRows(
    from items: [FeatureIntroBullet]
  ) -> [FeatureIntroVisibleRow] {
    if items.count <= maxWhatsNewRows {
      return items.map(FeatureIntroVisibleRow.bullet)
    }

    let kept = items.prefix(maxWhatsNewRows - 1)
    return kept.map(FeatureIntroVisibleRow.bullet) + [.andMore]
  }

  static func resolve(
    catalog: FeatureIntroCatalog,
    dismissedHighlightID: String?,
    dismissedWhatsNewID: String?
  ) -> FeatureIntroKind? {
    if let highlight = catalog.highlight,
       !isDismissed(id: highlight.id, dismissedID: dismissedHighlightID) {
      return .highlight(highlight)
    }

    guard !catalog.whatsNewItems.isEmpty,
          !isDismissed(id: catalog.whatsNewID, dismissedID: dismissedWhatsNewID)
    else {
      return nil
    }

    return .whatsNew(
      id: catalog.whatsNewID,
      rows: visibleWhatsNewRows(from: catalog.whatsNewItems)
    )
  }

  static func isDismissed(id: String, dismissedID: String?) -> Bool {
    guard let dismissedID, !dismissedID.isEmpty else { return false }
    return dismissedID == id
  }
}
