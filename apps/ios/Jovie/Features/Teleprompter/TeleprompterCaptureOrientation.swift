import AVFoundation
import UIKit

/// Maps device orientation to `AVCaptureConnection.videoRotationAngle`.
/// Portrait stays 90°. A 90° device turn must not apply 180° — that was the
/// outdoor-vlog preview flip.
enum TeleprompterCaptureOrientation {
  static func videoRotationAngle(for orientation: UIDeviceOrientation) -> CGFloat {
    switch orientation {
    case .portraitUpsideDown:
      return 270
    case .landscapeLeft:
      // Device rotated toward home-button/right edge. Front camera.
      return 180
    case .landscapeRight:
      return 0
    default:
      return 90
    }
  }

  static func resolvedDeviceOrientation(
    _ orientation: UIDeviceOrientation,
    fallback: UIDeviceOrientation = .portrait
  ) -> UIDeviceOrientation {
    switch orientation {
    case .portrait, .portraitUpsideDown, .landscapeLeft, .landscapeRight:
      return orientation
    default:
      return fallback
    }
  }

  static func scriptRegionHeight(
    isLandscape: Bool,
    presentationMode: TeleprompterPresentationMode
  ) -> CGFloat {
    if isLandscape { return 72 }
    return presentationMode == .notch ? 120 : 320
  }

  static func apply(to connection: AVCaptureConnection, orientation: UIDeviceOrientation) {
    let angle = videoRotationAngle(for: orientation)
    guard connection.isVideoRotationAngleSupported(angle) else { return }
    connection.videoRotationAngle = angle
  }
}
