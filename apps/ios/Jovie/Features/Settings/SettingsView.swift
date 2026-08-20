import SwiftUI

struct AppBuildInfo: Equatable {
  let version: String
  let build: String

  static func current(bundle: Bundle = .main) -> AppBuildInfo {
    AppBuildInfo(
      version: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0",
      build: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    )
  }
}

/// Settings uses system grouped List + toolbar chrome (JOV-5201). Liquid Glass
/// comes from the system materials on iOS 26+, not custom cards.
enum SettingsChromePolicy {
  static func usesSystemGroupedList() -> Bool { true }
  static func usesNativeNavigationChrome() -> Bool { true }
}

struct SettingsView: View {
  let profile: AppShellProfile
  let buildInfo: AppBuildInfo
  let accountURL: URL
  let billingURL: URL
  var onClose: (() -> Void)?
  let onLogout: @MainActor () async -> Void

  @Environment(\.openURL) private var openURL
  @State private var isLoggingOut = false
  @State private var isShowingLogoutConfirmation = false

  var body: some View {
    List {
      accountSection
      linksSection
      buildSection
      logoutSection
    }
    .listStyle(.insetGrouped)
    .scrollDismissesKeyboard(.interactively)
    .navigationTitle("Settings")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      if let onClose {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done", action: onClose)
            .accessibilityLabel("Close Settings")
        }
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

      Button {
        openURL(accountURL)
      } label: {
        Label("Manage Account", systemImage: "person.crop.circle")
      }
    }
  }

  private var linksSection: some View {
    Section("Jovie") {
      Button {
        openURL(URL(string: "https://jov.ie/support")!)
      } label: {
        Label("Support", systemImage: "questionmark.circle")
      }

      Button {
        openURL(billingURL)
      } label: {
        Label("Billing", systemImage: "creditcard")
      }

      Button {
        openURL(URL(string: "https://jov.ie/legal/privacy")!)
      } label: {
        Label("Privacy", systemImage: "hand.raised")
      }

      Button {
        openURL(URL(string: "https://jov.ie/legal/terms")!)
      } label: {
        Label("Terms", systemImage: "doc.text")
      }
    }
  }

  private var buildSection: some View {
    Section("App") {
      LabeledContent("Version", value: buildInfo.version)
      LabeledContent("Build", value: buildInfo.build)
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
          if isLoggingOut {
            ProgressView()
              .controlSize(.small)
          }

          Text(isLoggingOut ? "Logging Out" : "Log Out")
            .lineLimit(1)
            .minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      }
      .disabled(isLoggingOut)
      .accessibilityLabel("Log Out")
    }
  }

  private func performLogout() {
    guard !isLoggingOut else { return }
    isLoggingOut = true

    Task {
      await onLogout()
      isLoggingOut = false
    }
  }
}
