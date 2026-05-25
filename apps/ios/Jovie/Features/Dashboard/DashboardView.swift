import PassKit
import SwiftUI
import UIKit

struct DashboardAvatarView: View {
  let name: String
  let avatarURL: URL?

  var body: some View {
    Group {
      if let avatarURL {
        AsyncImage(url: avatarURL) { phase in
          switch phase {
          case let .success(image):
            image.resizable().scaledToFill()
          case .empty, .failure:
            fallback
          @unknown default:
            fallback
          }
        }
      } else {
        fallback
      }
    }
    .frame(width: 28, height: 28)
    .clipShape(Circle())
    .overlay(Circle().stroke(JovieColor.borderDefault, lineWidth: 1))
  }

  private var fallback: some View {
    ZStack {
      Circle().fill(JovieColor.surface1)
      Text(String(name.prefix(1)).uppercased())
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
    }
  }
}

struct DashboardView: View {
  let state: DashboardLoadState
  let isOffline: Bool
  let brightnessManager: BrightnessControlling
  let showVenueModeOnLaunch: Bool
  let loadAppleWalletProfilePass: @Sendable () async throws -> Data
  let onRetry: () async -> Void

  @State private var isShowingVenueMode = false
  @State private var didCopyURL = false
  @State private var didPresentLaunchVenueMode = false
  @State private var isAddingAppleWalletPass = false
  @State private var appleWalletPassSheet: AppleWalletPassSheet?
  @State private var appleWalletErrorMessage: String?

  init(
    state: DashboardLoadState,
    isOffline: Bool,
    brightnessManager: BrightnessControlling,
    showVenueModeOnLaunch: Bool = false,
    loadAppleWalletProfilePass: @escaping @Sendable () async throws -> Data = {
      throw APIClientError.missingToken
    },
    onRetry: @escaping () async -> Void
  ) {
    self.state = state
    self.isOffline = isOffline
    self.brightnessManager = brightnessManager
    self.showVenueModeOnLaunch = showVenueModeOnLaunch
    self.loadAppleWalletProfilePass = loadAppleWalletProfilePass
    self.onRetry = onRetry
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: JovieSpacing.xLarge) {
        header
        content
      }
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
    .sheet(item: $appleWalletPassSheet) { sheet in
      AppleWalletAddPassView(pass: sheet.pass)
    }
    .alert(
      "Apple Wallet",
      isPresented: Binding(
        get: { appleWalletErrorMessage != nil },
        set: { isPresented in
          if !isPresented {
            appleWalletErrorMessage = nil
          }
        }
      )
    ) {
      Button("OK", role: .cancel) {
        appleWalletErrorMessage = nil
      }
    } message: {
      Text(appleWalletErrorMessage ?? "Couldn't add the Wallet pass.")
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

  private var header: some View {
    HStack(spacing: JovieSpacing.medium) {
      switch state {
      case let .loaded(response):
        DashboardAvatarView(
          name: response.displayName ?? response.username ?? "Jovie",
          avatarURL: response.avatarURL.flatMap(URL.init(string:))
        )

        Text(response.displayName ?? response.username ?? "Jovie")
          .font(JovieFont.body(size: 15, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
      case .idle, .loading, .error:
        DashboardAvatarView(name: "Jovie", avatarURL: nil)
        Text("Jovie")
          .font(JovieFont.body(size: 15, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
      }

      Spacer()

      if isOffline {
        Text("Offline")
          .font(JovieFont.body(size: 12, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(JovieColor.surface1, in: Capsule())
      }
    }
    .padding(.bottom, JovieSpacing.large)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(JovieColor.borderSubtle)
        .frame(height: 1)
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

  private var skeleton: some View {
    VStack(spacing: JovieSpacing.large) {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(width: 280, height: 280)
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(width: 180, height: 18)
      HStack(spacing: JovieSpacing.medium) {
        RoundedRectangle(cornerRadius: 999, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 48)
        RoundedRectangle(cornerRadius: 999, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 48)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .redacted(reason: .placeholder)
  }

  private func loadedContent(response: MobileMeResponse) -> some View {
    VStack(spacing: JovieSpacing.large) {
      Button {
        isShowingVenueMode = true
      } label: {
        if let payload = response.qrPayload, let image = QRCodeRenderer.image(for: payload) {
          Image(uiImage: image)
            .interpolation(.none)
            .resizable()
            .scaledToFit()
            .padding(24)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .accessibilityLabel("Profile QR Code")
        } else {
          Text("QR unavailable")
            .font(JovieFont.body(size: 15, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
            .frame(width: 280, height: 280)
            .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity)
      .accessibilityLabel("Profile QR Code")
      .accessibilityIdentifier("profile-qr-button")

      Text(response.publicProfileURL ?? "jov.ie")
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textTertiary)

      HStack(spacing: JovieSpacing.medium) {
        Button(didCopyURL ? "Copied" : "Copy URL") {
          copyURL(response.publicProfileURL)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))

        ShareLink(item: response.publicProfileURL ?? response.continueOnWebURL) {
          Text("Share")
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
      }

      if response.appleWalletProfilePassAvailable && PKAddPassesViewController.canAddPasses() {
        ZStack(alignment: .trailing) {
          AppleWalletAddPassButton(isEnabled: !isAddingAppleWalletPass) {
            Task {
              await addAppleWalletPass()
            }
          }

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

  private func addAppleWalletPass() async {
    guard !isAddingAppleWalletPass else { return }
    isAddingAppleWalletPass = true
    defer { isAddingAppleWalletPass = false }

    do {
      let passData = try await loadAppleWalletProfilePass()
      let pass = try PKPass(data: passData)
      appleWalletPassSheet = AppleWalletPassSheet(pass: pass)
    } catch {
      appleWalletErrorMessage = "Couldn't add the Wallet pass. Try again."
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

private struct AppleWalletPassSheet: Identifiable {
  let id = UUID()
  let pass: PKPass
}

private struct AppleWalletAddPassButton: UIViewRepresentable {
  let isEnabled: Bool
  let action: @MainActor () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(action: action)
  }

  func makeUIView(context: Context) -> PKAddPassButton {
    let button = PKAddPassButton(addPassButtonStyle: .black)
    button.addTarget(
      context.coordinator,
      action: #selector(Coordinator.didTap),
      for: .touchUpInside
    )
    return button
  }

  func updateUIView(_ button: PKAddPassButton, context: Context) {
    context.coordinator.action = action
    button.isUserInteractionEnabled = isEnabled
    button.alpha = isEnabled ? 1 : 0.6
  }

  final class Coordinator: NSObject {
    var action: @MainActor () -> Void

    init(action: @escaping @MainActor () -> Void) {
      self.action = action
    }

    @MainActor
    @objc func didTap() {
      action()
    }
  }
}

private struct AppleWalletAddPassView: UIViewControllerRepresentable {
  let pass: PKPass

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIViewController(context: Context) -> UIViewController {
    guard let controller = PKAddPassesViewController(pass: pass) else {
      return UIViewController()
    }
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(_ controller: UIViewController, context: Context) {}

  final class Coordinator: NSObject, PKAddPassesViewControllerDelegate {
    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
      controller.dismiss(animated: true)
    }
  }
}
