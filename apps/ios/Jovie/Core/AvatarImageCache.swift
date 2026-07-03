import UIKit

/// Process-wide cache of decoded, downsampled remote bitmaps. Keyed by URL so
/// the same image rendered in the dashboard header, entity chips, and settings
/// never re-fetches or re-decodes — eliminating the flicker raw `AsyncImage`
/// produces by dropping back to its placeholder on every appearance.
enum AvatarImageCache {
  private static let cache: NSCache<NSURL, UIImage> = {
    let cache = NSCache<NSURL, UIImage>()
    cache.countLimit = 128
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
/// the main actor. Callers pass a display size so avatars and entity-chip
/// thumbnails downsample to the footprint they occupy on screen.
enum AvatarImageLoader {
  static func load(
    _ url: URL,
    thumbnailSize: CGSize = CGSize(width: 96, height: 96)
  ) async -> UIImage? {
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

    let thumbnail = await image.byPreparingThumbnail(ofSize: thumbnailSize) ?? image
    AvatarImageCache.store(thumbnail, for: url)
    return thumbnail
  }
}