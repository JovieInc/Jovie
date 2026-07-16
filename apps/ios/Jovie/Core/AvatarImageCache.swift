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

    // The async overload prepares the thumbnail off the main thread.
    let thumbnail = await image.byPreparingThumbnail(
      ofSize: CGSize(width: 96, height: 96)
    ) ?? image
    AvatarImageCache.store(thumbnail, for: url)
    return thumbnail
  }
}

/// Cache-first remote image view shared by dashboard avatars and chat entity
/// chip thumbnails (GH-12708). Seeds `@State` from `AvatarImageCache` in
/// `init` so re-appearance never flashes the fallback placeholder.
struct CachedRemoteImageView<Fallback: View>: View {
  let imageURL: URL?
  let size: CGFloat
  @ViewBuilder let fallback: () -> Fallback

  @State private var image: UIImage?

  init(
    imageURL: URL?,
    size: CGFloat,
    @ViewBuilder fallback: @escaping () -> Fallback
  ) {
    self.imageURL = imageURL
    self.size = size
    self.fallback = fallback
    _image = State(initialValue: imageURL.flatMap(AvatarImageCache.image(for:)))
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .transition(.opacity)
      } else {
        fallback()
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .animation(JovieMotion.easeOut(duration: JovieMotion.subtleDuration), value: image == nil)
    .task(id: imageURL) { await load() }
  }

  @MainActor
  private func load() async {
    guard let imageURL else {
      image = nil
      return
    }

    if let cached = AvatarImageCache.image(for: imageURL) {
      if image == nil {
        image = cached
      }
      return
    }

    guard let loaded = await AvatarImageLoader.load(imageURL) else {
      return
    }

    image = loaded
  }
}
