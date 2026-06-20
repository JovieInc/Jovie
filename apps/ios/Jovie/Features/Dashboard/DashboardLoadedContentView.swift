import PassKit
import SwiftUI

struct DashboardLoadedContentView: View {
  let response: MobileMeResponse
  let didCopyURL: Bool
  let isAddingAppleWalletPass: Bool
  let onOpenVenueMode: () -> Void
  let onCopyURL: (String?) -> Void
  let onAddAppleWalletPass: () -> Void

  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      Button(action: onOpenVenueMode) {
        QRCodeCardView(payload: response.qrPayload)
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity)
      .disabled(response.qrPayload == nil)
      .accessibilityLabel("Profile QR Code")
      .accessibilityIdentifier("profile-qr-button")

      Text(response.publicProfileURL ?? "jov.ie")
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textTertiary)

      HStack(spacing: JovieSpacing.medium) {
        Button(didCopyURL ? "Copied" : "Copy URL") {
          onCopyURL(response.publicProfileURL)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))

        ShareLink(item: response.publicProfileURL ?? response.continueOnWebURL) {
          Text("Share")
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
      }

      if response.appleWalletProfilePassAvailable && PKAddPassesViewController.canAddPasses() {
        ZStack(alignment: .trailing) {
          AppleWalletAddPassButton(isEnabled: !isAddingAppleWalletPass, action: onAddAppleWalletPass)

          if isAddingAppleWalletPass {
            ProgressView()
              .tint(.white)
              .padding(.trailing, 14)
              .accessibilityLabel("Preparing Apple Wallet pass")
          }
        }
        .frame(width: 220, height: 44)
        .accessibilityIdentifier("apple-wallet-profile-pass-button")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}