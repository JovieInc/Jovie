import SwiftUI
import UIKit

/// Process-wide cache of decoded, downsampled avatar bitmaps. Keyed by URL so
/// the same avatar rendered in the dashboard header, the menu, and settings
/// never re-fetches or re-decodes — eliminating the flicker raw `AsyncImage`
/// produces by dropping back to its placeholder on every appearance.
enum AvatarImageCache {
  private static let cache: NSCache<NSURL, UIImage> = {
    let cache = NSCache<NSURL, UIImage>()
    cache.countLimit = 64
    return cache
  }()

  static func image(for url: URL) -> UIImage? {
    cache.object(forKey: url as NSURL)
  }

  static func store(_ image: UIImage, for url: URL) {
    cache.setObject(image, forKey: url as NSURL)
  }
}

/// Non-isolated loader so the network fetch *and* the decode/downsample run off
/// the main actor. Avatars are tiny on screen, so we downsample to a small
/// thumbnail to keep memory and compositing cheap.
enum AvatarImageLoader {
  static func load(_ url: URL) async -> UIImage? {
    guard let (data, response) = try? await URLSession.shared.data(from: url) else {
      return nil
    }

    if let http = response as? HTTPURLResponse,
       !(200 ... 299).contains(http.statusCode)
    {
      return nil
    }

    guard let image = UIImage(data: data) else {
      return nil
    }

    let thumbnail = await image.byPreparingThumbnail(
      ofSize: CGSize(width: 96, height: 96)
    ) ?? image
    AvatarImageCache.store(thumbnail, for: url)
    return thumbnail
  }
}

struct DashboardAvatarView: View {
  let name: String
  let avatarURL: URL?

  @State private var image: UIImage?

  init(name: String, avatarURL: URL?) {
    self.name = name
    self.avatarURL = avatarURL
    _image = State(initialValue: avatarURL.flatMap(AvatarImageCache.image(for:)))
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .transition(.opacity)
      } else {
        fallback
      }
    }
    .frame(width: 28, height: 28)
    .clipShape(Circle())
    .overlay(Circle().stroke(JovieColor.borderDefault, lineWidth: 1))
    .animation(.easeOut(duration: 0.2), value: image == nil)
    .task(id: avatarURL) { await load() }
  }

  @MainActor
  private func load() async {
    guard let avatarURL else {
      image = nil
      return
    }

    if let cached = AvatarImageCache.image(for: avatarURL) {
      if image == nil {
        image = cached
      }
      return
    }

    guard let loaded = await AvatarImageLoader.load(avatarURL) else {
      return
    }

    image = loaded
  }

  private var fallback: some View {
    ZStack {
      Circle().fill(JovieColor.surface1)
      Text(String(name.prefix(1)).uppercased())
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
    }
  }
}