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
          .foregroundStyle(JovieColor.textPrimary)
      }

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
      Button {
        openURL(URL(string: "https://jov.ie/support")!)
      } label: {
        Label("Support", systemImage: "questionmark.circle")
          .foregroundStyle(JovieColor.textPrimary)
      }

      Button {
        openURL(billingURL)
      } label: {
        Label("Billing", systemImage: "creditcard")
          .foregroundStyle(JovieColor.textPrimary)
      }

      Button {
        openURL(URL(string: "https://jov.ie/legal/privacy")!)
      } label: {
        Label("Privacy", systemImage: "hand.raised")
          .foregroundStyle(JovieColor.textPrimary)
      }

      Button {
        openURL(URL(string: "https://jov.ie/legal/terms")!)
      } label: {
        Label("Terms", systemImage: "doc.text")
          .foregroundStyle(JovieColor.textPrimary)
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
          Text(isLoggingOut ? "Logging Out" : "Log Out")
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
