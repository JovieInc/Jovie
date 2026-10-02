import SwiftUI

enum ReleaseChannel: String, Equatable {
  case appStore
  case testFlight
  case development

  var displayName: String {
    switch self {
    case .appStore: return "App Store"
    case .testFlight: return "TestFlight"
    case .development: return "Development"
    }
  }
}

struct AppBuildInfo: Equatable {
  let version: String
  let build: String
  let channel: ReleaseChannel
  let commit: String?

  var shortCommit: String? {
    guard let commit, commit.count > 7 else { return commit }
    return String(commit.prefix(7))
  }

  static func current(bundle: Bundle = .main) -> AppBuildInfo {
    AppBuildInfo(
      version: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0",
      build: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1",
      channel: channel(bundle: bundle),
      commit: gitCommit(bundle: bundle)
    )
  }

  // Apple controls the install source: App Store installs carry a "receipt",
  // TestFlight installs carry a "sandboxReceipt". Nothing in-app can convert
  // one channel into the other; this only reports provenance.
  static func channel(bundle: Bundle = .main) -> ReleaseChannel {
    #if DEBUG
      return .development
    #else
      return channel(receiptName: bundle.appStoreReceiptURL?.lastPathComponent)
    #endif
  }

  static func channel(receiptName: String?) -> ReleaseChannel {
    switch receiptName {
    case "receipt": return .appStore
    case "sandboxReceipt": return .testFlight
    default: return .development
    }
  }

  static func gitCommit(bundle: Bundle = .main) -> String? {
    guard
      let url = bundle.url(forResource: "Configuration.local", withExtension: "plist"),
      let values = NSDictionary(contentsOf: url) as? [String: Any],
      let commit = (values["GitCommit"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
      !commit.isEmpty
    else { return nil }
    return commit
  }
}

enum SettingsLayout {
  static let reservedActionMinHeight: CGFloat = 48

  static func logoutTitle(isLoggingOut: Bool) -> String {
    isLoggingOut ? "Logging Out" : "Log Out"
  }
}

enum SettingsExternalURL {
  static let support = URL(string: "https://jov.ie/support")
  static let privacy = URL(string: "https://jov.ie/legal/privacy")
  static let terms = URL(string: "https://jov.ie/legal/terms")
  static let testflight = URL(string: "https://testflight.apple.com")
}

struct SettingsView: View {
  let profile: AppShellProfile
  let buildInfo: AppBuildInfo
  let accountURL: URL
  let billingURL: URL
  let onClose: () -> Void
  let onLogout: @MainActor () async -> Void
  var showsWorkspaceSwitch: Bool = false
  var workspaceMode: MobileWorkspaceMode = .jovie
  var onSelectWorkspace: (MobileWorkspaceMode) -> Void = { _ in }

  @State private var isLoggingOut = false
  @State private var isShowingLogoutConfirmation = false
  @AppStorage(BiometricLockSettings.enabledStorageKey)
  private var isBiometricLockEnabled = BiometricLockSettings.isEnabledByDefault

  var body: some View {
    List {
      accountSection
      securitySection
      linksSection
      buildSection
      logoutSection
    }
    .listStyle(.insetGrouped)
    .scrollDismissesKeyboard(.interactively)
    .navigationTitle("Settings")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button("Done", action: onClose)
          .accessibilityLabel("Close Settings")
      }
    }
    .toolbarBackground(.automatic, for: .navigationBar)
    .accessibilityIdentifier("settings-view")
    .confirmationDialog(
      "Log out of Jovie?",
      isPresented: $isShowingLogoutConfirmation,
      titleVisibility: .visible
    ) {
      Button("Log Out", role: .destructive) {
        performLogout()
      }
      .accessibilityLabel("Confirm Log Out")

      Button("Cancel", role: .cancel) {}
    } message: {
      Text("You'll need to sign in again to use your creator account on this device.")
    }
  }

  private var securitySection: some View {
    Section("Security") {
      Toggle(isOn: $isBiometricLockEnabled) {
        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text("App Lock")

          Text("Require Face ID, Touch ID, or your device passcode to open Jovie.")
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .accessibilityIdentifier("settings-biometric-lock-toggle")
      .accessibilityHint("Locks Jovie on launch and after one minute in the background")
    }
  }

  private var accountSection: some View {
    Section("Account") {
      HStack(spacing: JovieSpacing.medium) {
        DashboardAvatarView(
          name: profile.displayName,
          avatarURL: profile.avatarURL
        )
        .frame(width: 34, height: 34)

        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text(profile.displayName)
            .font(JovieFont.body(size: 15, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
            .lineLimit(1)

          Text(profile.secondaryText)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)
            .lineLimit(1)
        }

        Spacer(minLength: 0)
      }
      .accessibilityElement(children: .combine)

      SettingsLinkRow(
        title: "Manage Account",
        systemImage: "person.crop.circle",
        destination: accountURL
      )
      .jovieSurface(radius: JovieRadius.medium, interactive: true)

      if showsWorkspaceSwitch {
        Button {
          onSelectWorkspace(workspaceMode.toggled)
        } label: {
          LabeledContent("Workspace", value: workspaceMode.displayName)
        }
        .accessibilityIdentifier("settings-workspace-switch")
        .accessibilityLabel("Workspace \(workspaceMode.displayName)")
        .accessibilityHint("Switches between Jovie and Ovie")
      }
    }
  }

  private var linksSection: some View {
    Section("Jovie") {
      if let support = SettingsExternalURL.support {
        SettingsLinkRow(title: "Support", systemImage: "questionmark.circle", destination: support)
      }

      SettingsLinkRow(title: "Billing", systemImage: "creditcard", destination: billingURL)

      if let privacy = SettingsExternalURL.privacy {
        SettingsLinkRow(title: "Privacy", systemImage: "hand.raised", destination: privacy)
      }

      if let terms = SettingsExternalURL.terms {
        SettingsLinkRow(title: "Terms", systemImage: "doc.text", destination: terms)
      }
    }
  }

  private var buildSection: some View {
    Section("App") {
      LabeledContent("Version", value: buildInfo.version)
      LabeledContent("Build", value: buildInfo.build)
      LabeledContent("Channel", value: buildInfo.channel.displayName)
        .accessibilityIdentifier("settings-release-channel")
      if let shortCommit = buildInfo.shortCommit {
        LabeledContent("Commit", value: shortCommit)
          .accessibilityIdentifier("settings-build-commit")
      }

      // Admin-only dogfood rail entry. The link only opens Apple's own
      // TestFlight enrollment/install surface; channel switching stays
      // Apple-controlled (JOV-7534).
      if showsWorkspaceSwitch, buildInfo.channel != .testFlight,
        let testflight = SettingsExternalURL.testflight
      {
        SettingsLinkRow(
          title: "Open TestFlight",
          systemImage: "testtube.2",
          destination: testflight
        )
        .jovieSurface(radius: JovieRadius.medium, interactive: true)
        .accessibilityIdentifier("settings-open-testflight")
      }
    }
  }

  private var logoutSection: some View {
    Section {
      Button(role: .destructive) {
        guard !isLoggingOut else { return }
        isShowingLogoutConfirmation = true
      } label: {
        // Reserve a stable footprint across Log Out / Logging Out so the
        // row never reflows (layout-shift prevention).
        HStack(spacing: JovieSpacing.small) {
          Text(SettingsLayout.logoutTitle(isLoggingOut: isLoggingOut))
            .lineLimit(1)
            .minimumScaleFactor(0.85)

          Spacer(minLength: 0)

          ZStack {
            if isLoggingOut {
              ProgressView()
                .controlSize(.small)
                .tint(JovieColor.textPrimary)
                .transition(.opacity)
            }
          }
          .frame(width: 20, height: 20)
          .accessibilityHidden(!isLoggingOut)
        }
        .frame(maxWidth: .infinity, minHeight: SettingsLayout.reservedActionMinHeight, alignment: .leading)
      }
      .disabled(isLoggingOut)
      .accessibilityLabel("Log Out")
    }
  }

  private func performLogout() {
    guard !isLoggingOut else { return }
    isLoggingOut = true

    Task {
      #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-delayed-logout") {
          try? await Task.sleep(for: .seconds(5))
        }
      #endif
      await onLogout()
      isLoggingOut = false
    }
  }
}

private struct SettingsLinkRow: View {
  let title: String
  let systemImage: String
  let destination: URL

  var body: some View {
    Link(destination: destination) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: systemImage)
          .frame(width: 20)

        Text(title)

        Spacer()

        Image(systemName: "arrow.up.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
      }
      .font(JovieFont.body(size: 14, weight: .medium))
      .foregroundStyle(JovieColor.textPrimary)
      .padding(.horizontal, JovieSpacing.medium)
      .padding(.vertical, JovieSpacing.medium)
    }
    // No custom ButtonStyle here: any custom style on a List-row Link/Button
    // swallows the tap on iOS 26 (UITest-verified), so rows keep the native
    // press feedback.
    .tint(JovieColor.textPrimary)
    .accessibilityLabel(title)
  }
}
