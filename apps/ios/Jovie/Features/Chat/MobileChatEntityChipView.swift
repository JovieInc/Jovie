import SwiftUI
import UIKit

enum MobileChatEntityThumbnailResolver {
  /// Cache-only thumbnail lookup for chat entity chips. Returns a URL when the
  /// UI-testing fixture (or future profile-scoped entity cache) knows artwork
  /// for the token; otherwise chips degrade to the accent-dot slot (web parity).
  static func thumbnailURL(kind: MobileChatEntityKind, id: String) -> URL? {
    MobileChatEntityFixtureThumbnailRegistry.thumbnailURL(kind: kind, id: id)
  }
}

/// Reserved 16×16 media slot for transcript entity chips. Uses
/// `AvatarImageCache` + off-main decode; never raw `AsyncImage`.
struct EntityChipThumbnailView: View {
  let url: URL?
  let accent: Color

  @State private var image: UIImage?

  private static let displaySize = CGSize(width: 32, height: 32)
  private static let frameSize: CGFloat = 16

  init(url: URL?, accent: Color) {
    self.url = url
    self.accent = accent
    _image = State(initialValue: url.flatMap(AvatarImageCache.image(for:)))
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .transition(.opacity)
      } else {
        accentDot
      }
    }
    .frame(width: Self.frameSize, height: Self.frameSize)
    .clipShape(Circle())
    .animation(.easeOut(duration: 0.2), value: image == nil)
    .task(id: url) { await load() }
    .accessibilityHidden(true)
  }

  @MainActor
  private func load() async {
    guard let url else {
      image = nil
      return
    }

    if let cached = AvatarImageCache.image(for: url) {
      if image == nil {
        image = cached
      }
      return
    }

    guard let loaded = await AvatarImageLoader.load(url, thumbnailSize: Self.displaySize) else {
      return
    }

    image = loaded
  }

  private var accentDot: some View {
    ZStack {
      Circle()
        .strokeBorder(accent.opacity(0.35), lineWidth: 1)
      Circle()
        .fill(accent)
        .padding(5)
    }
  }
}

/// Transcript-variant entity chip — pill with thumbnail/dot + label. Mirrors
/// web `EntityChip` (`variant='transcript'`) and replaces the JOV-3608 v1
/// underline-only text runs for entity mentions.
struct MobileChatEntityChipView: View {
  let kind: MobileChatEntityKind
  let id: String
  let label: String
  let tone: MobileChatProseTone

  private var accent: Color {
    JovieColor.EntityAccent.color(for: kind)
  }

  var body: some View {
    HStack(spacing: JovieSpacing.xSmall) {
      EntityChipThumbnailView(
        url: MobileChatEntityThumbnailResolver.thumbnailURL(kind: kind, id: id),
        accent: accent
      )
      Text(label)
        .font(JovieFont.body(size: 13, weight: .medium))
        .foregroundStyle(labelColor)
        .lineLimit(1)
        .truncationMode(.tail)
    }
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .background(backgroundColor, in: Capsule())
    .overlay {
      Capsule().strokeBorder(borderColor, lineWidth: 1)
    }
    .frame(maxWidth: 220, alignment: .leading)
    .accessibilityLabel("\(kindAccessibilityPrefix): \(label)")
  }

  private var kindAccessibilityPrefix: String {
    switch kind {
    case .release: return "Release"
    case .artist: return "Artist"
    case .track: return "Track"
    case .event: return "Event"
    }
  }

  private var borderColor: Color {
    switch tone {
    case .onDark:
      return accent.opacity(0.22)
    case .onLight:
      return accent.opacity(0.30)
    }
  }

  private var backgroundColor: Color {
    switch tone {
    case .onDark:
      return accent.opacity(0.11)
    case .onLight:
      return accent.opacity(0.08)
    }
  }

  private var labelColor: Color {
    switch tone {
    case .onDark:
      return accent.opacity(0.86)
    case .onLight:
      return JovieColor.backgroundBase.opacity(0.92)
    }
  }
}