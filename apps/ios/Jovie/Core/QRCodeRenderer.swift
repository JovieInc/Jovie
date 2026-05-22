import CoreImage.CIFilterBuiltins
import UIKit

enum QRCodeRenderer {
  private static let cache = NSCache<NSString, UIImage>()
  private static let context = CIContext(options: [.cacheIntermediates: false])

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
