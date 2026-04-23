import CoreImage.CIFilterBuiltins
import UIKit

enum QRCodeRenderer {
  static func image(for payload: String, scale: CGFloat = 12) -> UIImage? {
    guard !payload.isEmpty else {
      return nil
    }

    let context = CIContext()
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

    return UIImage(cgImage: cgImage)
  }
}
