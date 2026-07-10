import SwiftUI
import UIKit

/// Mini landing page for a referenced entity (JOV-3634). Opens from chip tap
/// or right-edge swipe when a recent entity is available.
struct EntityContextItem: Identifiable, Equatable, Hashable, Sendable {
  let kind: MobileChatEntityKind
  let entityID: String
  let label: String

  var id: String { "\(kind.rawValue):\(entityID)" }

  var title: String { label }

  var kindTitle: String {
    switch kind {
    case .release: return "Release"
    case .artist: return "Artist"
    case .track: return "Track"
    case .event: return "Event"
    }
  }

  var publicURL: String {
    "https://jov.ie/e/\(kind.rawValue)/\(entityID)"
  }

  var coverURL: URL? {
    MobileChatEntityThumbnailResolver.thumbnailURL(kind: kind, id: entityID)
  }
}

enum EntityContextStats {
  struct Snapshot: Equatable, Sendable {
    let visits: String
    let attachedMerch: String
    let retargeting: String
    let topPlatform: String
  }

  /// Stable placeholder stats until asset-graph pages are wired to mobile.
  static func snapshot(for item: EntityContextItem) -> Snapshot {
    // Deterministic pseudo-stats from id so the sheet never layout-shifts on
    // open and unit tests can assert stable strings.
    let seed = abs(item.entityID.hashValue)
    let visits = (seed % 900) + 100
    let merch = seed % 5
    return Snapshot(
      visits: "\(visits)",
      attachedMerch: "\(merch)",
      retargeting: merch > 0 ? "On" : "Off",
      topPlatform: ["Spotify", "Instagram", "TikTok", "YouTube"][seed % 4]
    )
  }
}

struct EntityContextSheet: View {
  let item: EntityContextItem
  let onEditInChat: (String) -> Void
  let onDismiss: () -> Void

  @State private var isPublic: Bool
  @State private var didCopyLink = false

  init(
    item: EntityContextItem,
    isPublicInitially: Bool = true,
    onEditInChat: @escaping (String) -> Void,
    onDismiss: @escaping () -> Void
  ) {
    self.item = item
    self.onEditInChat = onEditInChat
    self.onDismiss = onDismiss
    _isPublic = State(initialValue: isPublicInitially)
  }

  private var stats: EntityContextStats.Snapshot {
    EntityContextStats.snapshot(for: item)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
          header
          visibilityRow
          statsGrid
          actions
        }
        .padding(JovieSpacing.xLarge)
      }
      .background(JovieColor.backgroundBase)
      .navigationTitle(item.kindTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done", action: onDismiss)
            .font(JovieFont.body(size: 16, weight: .semibold))
            .accessibilityIdentifier("entity-sheet-done")
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .presentationBackground(JovieColor.backgroundBase)
    .accessibilityIdentifier("entity-context-sheet")
  }

  private var header: some View {
    HStack(spacing: JovieSpacing.medium) {
      ZStack {
        RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
          .fill(JovieColor.surface1)
        if let coverURL = item.coverURL {
          CachedRemoteImageView(imageURL: coverURL, size: 72) {
            accentDot
          }
          .clipShape(RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
        } else {
          accentDot
        }
      }
      .frame(width: 72, height: 72)

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(item.title)
          .font(JovieFont.display(size: 22))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(2)
          .accessibilityIdentifier("entity-sheet-title")

        Text(item.kindTitle)
          .font(JovieFont.body(size: 14, weight: .medium))
          .foregroundStyle(JovieColor.EntityAccent.color(for: item.kind))
      }
      Spacer(minLength: 0)
    }
  }

  private var accentDot: some View {
    Circle()
      .fill(JovieColor.EntityAccent.color(for: item.kind).opacity(0.35))
      .padding(18)
  }

  private var visibilityRow: some View {
    HStack {
      VStack(alignment: .leading, spacing: 4) {
        Text(isPublic ? "Public" : "Private")
          .font(JovieFont.body(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
        Text(isPublic ? item.publicURL : "Only you can see this.")
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
          .lineLimit(1)
      }
      Spacer()
      Toggle("", isOn: $isPublic)
        .labelsHidden()
        .tint(JovieColor.accent)
        .accessibilityIdentifier("entity-sheet-public-toggle")
        .accessibilityLabel(isPublic ? "Public" : "Private")
    }
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
  }

  private var statsGrid: some View {
    LazyVGrid(
      columns: [
        GridItem(.flexible(), spacing: JovieSpacing.medium),
        GridItem(.flexible(), spacing: JovieSpacing.medium),
      ],
      spacing: JovieSpacing.medium
    ) {
      statTile(title: "Visits", value: stats.visits)
      statTile(title: "Merch", value: stats.attachedMerch)
      statTile(title: "Retargeting", value: stats.retargeting)
      statTile(title: "Top Platform", value: stats.topPlatform)
    }
    .accessibilityIdentifier("entity-sheet-stats")
  }

  private func statTile(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      Text(title)
        .font(JovieFont.body(size: 12, weight: .medium))
        .foregroundStyle(JovieColor.textTertiary)
      Text(value)
        .font(JovieFont.body(size: 18, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
  }

  private var actions: some View {
    VStack(spacing: JovieSpacing.medium) {
      Button {
        onEditInChat("Edit \(item.title) in chat")
      } label: {
        Text("Edit In Chat")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: true))
      .accessibilityIdentifier("entity-sheet-edit-in-chat")

      Button {
        UIPasteboard.general.string = item.publicURL
        didCopyLink = true
      } label: {
        Text(didCopyLink ? "Copied" : "Copy Link")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: false))
      .accessibilityIdentifier("entity-sheet-copy-link")
    }
  }
}
