import CoreImage.CIFilterBuiltins
import UIKit

enum QRCodeRenderer {
  private static let cache = NSCache<NSString, UIImage>()
  private static let context = CIContext(options: [.cacheIntermediates: false])

  /// Returns an already-rendered QR image without doing any CoreImage work.
  /// Lets views paint instantly on a cache hit and only defer to async
  /// rendering on a miss.
  static func cachedImage(for payload: String, scale: CGFloat = 12) -> UIImage? {
    guard !payload.isEmpty else {
      return nil
    }

    return cache.object(forKey: "\(scale):\(payload)" as NSString)
  }

  /// Renders the QR off the main actor. CoreImage generation + `createCGImage`
  /// are CPU-bound and must never run inside a SwiftUI `body` on the main
  /// thread (that hitches the first dashboard/venue paint).
  static func imageAsync(for payload: String, scale: CGFloat = 12) async -> UIImage? {
    await Task.detached(priority: .userInitiated) {
      image(for: payload, scale: scale)
    }.value
  }

  static func image(for payload: String, scale: CGFloat = 12) -> UIImage? {
    guard !payload.isEmpty else {
      return nil
    }

    let cacheKey = "\(scale):\(payload)" as NSString
    if let cachedImage = cache.object(forKey: cacheKey) {
      return cachedImage
    }

    let filter = CIFilter.qrCodeGenerator()
    filter.setValue(Data(payload.utf8), forKey: "inputMessage")
    filter.correctionLevel = "M"

    guard let outputImage = filter.outputImage else {
      return nil
    }

    let transformed = outputImage.transformed(
      by: CGAffineTransform(scaleX: scale, y: scale)
    )

    guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else {
      return nil
    }

    let image = UIImage(cgImage: cgImage)
    cache.setObject(image, forKey: cacheKey)
    return image
  }

  static func clearCache() {
    cache.removeAllObjects()
  }
}
