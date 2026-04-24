import SwiftUI
import UIKit

private struct DashboardAvatarView: View {
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
  let onRetry: () async -> Void

  @State private var isShowingVenueMode = false
  @State private var didCopyURL = false

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
        }
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity)
      .accessibilityLabel(response.publicProfileURL ?? "Profile QR code")

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
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
