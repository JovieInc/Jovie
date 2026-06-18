import PassKit
import SwiftUI
import UIKit

/// Process-wide cache of decoded, downsampled avatar bitmaps. Keyed by URL so
/// the same avatar rendered in the dashboard header, the menu, and settings
/// never re-fetches or re-decodes — eliminating the flicker raw `AsyncImage`
/// produces by dropping back to its placeholder on every appearance.
enum AvatarImageCache {
  private static let cache: NSCache<NSURL, UIImage> = {
    let cache = NSCache<NSURL, UIImage>()
    cache.countLimit = 64
    return cache
  }()

  static func image(for url: URL) -> UIImage? {
    cache.object(forKey: url as NSURL)
  }

  static func store(_ image: UIImage, for url: URL) {
    cache.setObject(image, forKey: url as NSURL)
  }
}

/// Non-isolated loader so the network fetch *and* the decode/downsample run off
/// the main actor. Avatars are tiny on screen, so we downsample to a small
/// thumbnail to keep memory and compositing cheap.
enum AvatarImageLoader {
  static func load(_ url: URL) async -> UIImage? {
    guard let (data, response) = try? await URLSession.shared.data(from: url) else {
      return nil
    }

    if let http = response as? HTTPURLResponse,
       !(200 ... 299).contains(http.statusCode)
    {
      return nil
    }

    guard let image = UIImage(data: data) else {
      return nil
    }

    // The async overload prepares the thumbnail off the main thread.
    let thumbnail = await image.byPreparingThumbnail(
      ofSize: CGSize(width: 96, height: 96)
    ) ?? image
    AvatarImageCache.store(thumbnail, for: url)
    return thumbnail
  }
}

struct DashboardAvatarView: View {
  let name: String
  let avatarURL: URL?

  @State private var image: UIImage?

  init(name: String, avatarURL: URL?) {
    self.name = name
    self.avatarURL = avatarURL
    // Seed from cache synchronously so a previously-loaded avatar shows on the
    // very first frame — no placeholder flash on re-appearance.
    _image = State(initialValue: avatarURL.flatMap(AvatarImageCache.image(for:)))
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .transition(.opacity)
      } else {
        fallback
      }
    }
    .frame(width: 28, height: 28)
    .clipShape(Circle())
    .overlay(Circle().stroke(JovieColor.borderDefault, lineWidth: 1))
    .animation(.easeOut(duration: 0.2), value: image == nil)
    .task(id: avatarURL) { await load() }
  }

  @MainActor
  private func load() async {
    guard let avatarURL else {
      image = nil
      return
    }

    if let cached = AvatarImageCache.image(for: avatarURL) {
      if image == nil {
        image = cached
      }
      return
    }

    guard let loaded = await AvatarImageLoader.load(avatarURL) else {
      return
    }

    image = loaded
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

  // Mirrors the loaded layout exactly (full-width square QR, single URL line,
  // two full-width pills, top-aligned) so the skeleton → loaded transition
  // causes zero layout shift on a cold (uncached) first load.
  private var skeleton: some View {
    VStack(spacing: JovieSpacing.large) {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .fill(JovieColor.surface1)
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
      RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(width: 180, height: 16)
      HStack(spacing: JovieSpacing.medium) {
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 46)
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 46)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .redacted(reason: .placeholder)
  }

  private func loadedContent(response: MobileMeResponse) -> some View {
    VStack(spacing: JovieSpacing.large) {
      Button {
        isShowingVenueMode = true
      } label: {
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
    .animation(.easeOut(duration: 0.2), value: image == nil)
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
