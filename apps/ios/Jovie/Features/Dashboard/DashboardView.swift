import PassKit
import SwiftUI
import UIKit

struct DashboardAvatarView: View {
  let name: String
  let avatarURL: URL?

  var body: some View {
    CachedRemoteImageView(imageURL: avatarURL, size: 28) {
      ZStack {
        Circle().fill(JovieColor.surface1)
        Text(String(name.prefix(1)).uppercased())
          .font(JovieFont.body(size: 13, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
      }
    }
    .overlay(Circle().stroke(JovieColor.borderDefault, lineWidth: 1))
  }
}

struct DashboardView: View {
  let state: DashboardLoadState
  let brightnessManager: BrightnessControlling
  let webBaseURL: URL
  let showVenueModeOnLaunch: Bool
  let loadAppleWalletProfilePass: @Sendable () async throws -> Data
  let onRetry: () async -> Void

  @State private var isShowingVenueMode = false
  @State private var didCopyURL = false
  @State private var didPresentLaunchVenueMode = false
  @State private var appleWalletFlowState = AppleWalletFlowState.available
  @State private var appleWalletPassSheet: AppleWalletPassSheet?
  @State private var publicProfileBrowserDestination: PublicProfileBrowserDestination?

  init(
    state: DashboardLoadState,
    brightnessManager: BrightnessControlling,
    webBaseURL: URL,
    showVenueModeOnLaunch: Bool = false,
    loadAppleWalletProfilePass: @escaping @Sendable () async throws -> Data = {
      throw APIClientError.missingToken
    },
    onRetry: @escaping () async -> Void
  ) {
    self.state = state
    self.brightnessManager = brightnessManager
    self.webBaseURL = webBaseURL
    self.showVenueModeOnLaunch = showVenueModeOnLaunch
    self.loadAppleWalletProfilePass = loadAppleWalletProfilePass
    self.onRetry = onRetry
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      content
        .padding(JovieSpacing.xLarge)
    }
    .fullScreenCover(isPresented: $isShowingVenueMode) {
      if case let .loaded(response) = state, let payload = response.qrPayload {
        VenueModeView(
          qrPayload: payload,
          brightnessManager: brightnessManager,
          onDismiss: { isShowingVenueMode = false }
        )
      }
    }
    .fullScreenCover(item: $publicProfileBrowserDestination) { destination in
      PublicProfileBrowserView(initialURL: destination.url, policy: destination.policy)
    }
    .sheet(
      item: $appleWalletPassSheet,
      onDismiss: {
        if appleWalletFlowState == .presenting {
          appleWalletFlowState.presentationFinished(isInstalled: false)
        }
      }
    ) { sheet in
      AppleWalletAddPassView(controller: sheet.controller) {
        let isInstalled = PKPassLibrary().containsPass(sheet.pass)
        appleWalletPassSheet = nil
        appleWalletFlowState.presentationFinished(isInstalled: isInstalled)
      }
    }
    .task(id: showVenueModeOnLaunch) {
      guard showVenueModeOnLaunch, !didPresentLaunchVenueMode else {
        return
      }

      didPresentLaunchVenueMode = true
      await Task.yield()
      isShowingVenueMode = true
    }
  }

  @ViewBuilder
  private var content: some View {
    switch state {
    case .idle, .loading:
      skeleton
    case let .error(message):
      VStack(spacing: JovieSpacing.large) {
        Text(message)
          .font(JovieFont.body(size: 16, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)

        Button("Retry") {
          Task {
            await onRetry()
          }
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    case let .loaded(response):
      loadedContent(response: response)
    }
  }

  // Mirrors the loaded layout exactly (full-width square QR, single URL line,
  // one full-width pill, two half-width pills, and the Wallet slot, top-aligned)
  // so the skeleton → loaded transition causes zero layout shift on a cold first load.
  private var skeleton: some View {
    VStack(spacing: JovieSpacing.large) {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .fill(JovieColor.surface1)
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
      RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(width: 180, height: 16)
      RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(height: 46)

      HStack(spacing: JovieSpacing.medium) {
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 46)
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 46)
      }

      RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(width: 220, height: 44)
        .frame(minHeight: 88, alignment: .top)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .redacted(reason: .placeholder)
  }

  private func loadedContent(response: MobileMeResponse) -> some View {
    ScrollView {
      VStack(spacing: JovieSpacing.large) {
        Button {
          isShowingVenueMode = true
        } label: {
          QRCodeCardView(payload: response.qrPayload)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .disabled(response.qrPayload == nil)
        .accessibilityLabel(response.qrPayload == nil ? "QR unavailable" : "Profile QR Code")
        .accessibilityIdentifier("profile-qr-button")

        Text(response.publicProfileURL ?? "Profile link unavailable")
          .font(JovieFont.body(size: 14))
          .foregroundStyle(JovieColor.textTertiary)
          .accessibilityIdentifier("dashboard-profile-url")

        Button("Open Public Profile") {
          if let destination = publicProfileDestination(from: response.publicProfileURL) {
            publicProfileBrowserDestination = destination
          }
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .disabled(publicProfileDestination(from: response.publicProfileURL) == nil)
        .accessibilityIdentifier("dashboard-open-public-profile-button")

        HStack(spacing: JovieSpacing.medium) {
          Button(didCopyURL ? "Copied" : "Copy URL") {
            copyURL(response.publicProfileURL)
          }
          .buttonStyle(JoviePillButtonStyle(filled: false))
          .disabled(response.publicProfileURL == nil)
          .opacity(response.publicProfileURL == nil ? 0.35 : 1)
          .accessibilityIdentifier("dashboard-copy-url-button")
          .accessibilityValue(didCopyURL ? "Copied" : "Copy URL")

          ShareLink(item: response.publicProfileURL ?? "") {
            Text("Share")
          }
          .buttonStyle(JoviePillButtonStyle(filled: true))
          .disabled(response.publicProfileURL == nil)
          .opacity(response.publicProfileURL == nil ? 0.35 : 1)
          .accessibilityIdentifier("dashboard-share-profile-button")
        }

        appleWalletControl(response: response)
          .frame(minHeight: 88, alignment: .top)
      }
      .frame(maxWidth: .infinity, alignment: .top)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }

  @ViewBuilder
  private func appleWalletControl(response: MobileMeResponse) -> some View {
    let availability = AppleWalletControlAvailability(
      serverAvailable: response.appleWalletProfilePassAvailable,
      deviceCanAddPasses: PKAddPassesViewController.canAddPasses()
    )

    if availability == .serverUnavailable {
      walletStatus("Apple Wallet isn't available for this profile yet.")
    } else if availability == .deviceUnsupported {
      walletStatus("Apple Wallet isn't available on this device.")
    } else if appleWalletFlowState == .installed {
      walletStatus("Added to Apple Wallet")
    } else {
      VStack(spacing: JovieSpacing.small) {
        if appleWalletFlowState == .failed {
          walletStatus("Couldn't prepare the Wallet pass. Try again.")
        } else if appleWalletFlowState == .controllerUnavailable {
          walletStatus("Apple Wallet couldn't open. Try again.")
        }

        ZStack(alignment: .trailing) {
          AppleWalletAddPassButton(isEnabled: !appleWalletFlowState.preventsRequest) {
            Task {
              await addAppleWalletPass()
            }
          }

          if appleWalletFlowState == .loading {
            ProgressView()
              .tint(.white)
              .padding(.trailing, 14)
              .accessibilityLabel("Preparing Apple Wallet pass")
          }
        }
        .frame(width: 220, height: 44)
        .accessibilityIdentifier("apple-wallet-profile-pass-button")
        .accessibilityHint("Adds your public Jovie profile pass to Apple Wallet")
      }
    }
  }

  private func walletStatus(_ message: String) -> some View {
    Text(message)
      .font(JovieFont.body(size: 14))
      .foregroundStyle(JovieColor.textTertiary)
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityLabel(message)
      .accessibilityIdentifier("apple-wallet-profile-pass-status")
  }

  private func publicProfileDestination(from value: String?) -> PublicProfileBrowserDestination? {
    guard let value,
          let policy = PublicProfileURLPolicy(publicProfileURL: value),
          let url = policy.validatedURL(from: value)
    else { return nil }
    return PublicProfileBrowserDestination(url: url, policy: policy)
  }

  private func addAppleWalletPass() async {
    guard appleWalletFlowState.beginRequest() else { return }

    do {
      let passData = try await loadAppleWalletProfilePass()
      let pass = try PKPass(data: passData)
      if PKPassLibrary().containsPass(pass) {
        appleWalletFlowState.preparedPass(isInstalled: true)
        return
      }

      guard let controller = PKAddPassesViewController(pass: pass) else {
        appleWalletFlowState.preparedPass(
          isInstalled: false,
          controllerAvailable: false
        )
        return
      }

      appleWalletFlowState.preparedPass(isInstalled: false)
      appleWalletPassSheet = AppleWalletPassSheet(
        pass: pass,
        controller: controller
      )
    } catch {
      appleWalletFlowState.requestFailed()
    }
  }

  private func copyURL(_ value: String?) {
    guard let value else { return }
    UIPasteboard.general.string = value
    didCopyURL = true

    Task {
      try? await Task.sleep(for: .seconds(2))
      didCopyURL = false
    }
  }
}
