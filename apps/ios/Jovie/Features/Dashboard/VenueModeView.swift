import SwiftUI
import UIKit

struct VenueModeView: View {
  let qrPayload: String
  let brightnessManager: BrightnessControlling
  let onDismiss: () -> Void

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: JovieSpacing.large) {
        if let image = QRCodeRenderer.image(for: qrPayload) {
          Image(uiImage: image)
            .interpolation(.none)
            .resizable()
            .scaledToFit()
            .padding(24)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        }

        Button("Done") {
          onDismiss()
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
      }
      .padding(JovieSpacing.xLarge)
    }
    .task {
      await brightnessManager.setMaxBrightness()
      UIApplication.shared.isIdleTimerDisabled = true
    }
    .onDisappear {
      UIApplication.shared.isIdleTimerDisabled = false
      Task {
        await brightnessManager.restoreBrightness()
      }
    }
  }
}
