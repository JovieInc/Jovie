import PassKit
import SwiftUI
import UIKit

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
      DashboardSkeletonView()
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
      DashboardLoadedContentView(
        response: response,
        didCopyURL: didCopyURL,
        isAddingAppleWalletPass: isAddingAppleWalletPass,
        onOpenVenueMode: { isShowingVenueMode = true },
        onCopyURL: copyURL,
        onAddAppleWalletPass: {
          Task {
            await addAppleWalletPass()
          }
        }
      )
    }
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