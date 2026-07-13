import SwiftUI
import UIKit

/// A fixed-aspect QR card that reserves its square footprint up front and
/// renders the QR off the main thread. The reserved space guarantees zero
/// layout shift between the loading, loaded, and unavailable states. Shared by
/// the dashboard and Venue Mode so both render identically. Uses the shared
/// ``JovieQRCodePlate`` tokens so the plate matches the rest of the system.
struct QRCodeCardView: View {
  let payload: String?
  var accessibilityLabelText: String = "Profile QR Code"

  @State private var image: UIImage?

  init(payload: String?, accessibilityLabelText: String = "Profile QR Code") {
    self.payload = payload
    self.accessibilityLabelText = accessibilityLabelText
    // Seed from the renderer cache so a QR rendered once (e.g. on the
    // dashboard) appears instantly when Venue Mode opens — no flash.
    _image = State(
      initialValue: payload.flatMap { QRCodeRenderer.cachedImage(for: $0) }
    )
  }

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: JovieQRCodePlate.radius, style: .continuous)
        .fill(payload == nil ? JovieColor.surface1 : JovieQRCodePlate.background)

      if let image {
        Image(uiImage: image)
          .interpolation(.none)
          .resizable()
          .scaledToFit()
          .padding(JovieQRCodePlate.padding)
          .transition(.opacity)
          .accessibilityLabel(accessibilityLabelText)
      } else if payload == nil {
        Text("QR unavailable")
          .font(JovieFont.body(size: 15, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
    .aspectRatio(1, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .animation(JovieMotion.easeOut(duration: JovieMotion.subtleDuration), value: image == nil)
    .task(id: payload) { await render() }
  }

  @MainActor
  private func render() async {
    guard let payload, !payload.isEmpty else {
      image = nil
      return
    }

    if let cached = QRCodeRenderer.cachedImage(for: payload) {
      if image == nil {
        image = cached
      }
      return
    }

    image = await QRCodeRenderer.imageAsync(for: payload)
  }
}
