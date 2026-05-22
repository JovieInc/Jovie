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
  var onClose: (() -> Void)?
  let onLogout: @MainActor () async -> Void

  @Environment(\.openURL) private var openURL
  @State private var isLoggingOut = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
        header
        accountSection
        linksSection
        buildSection
        logoutButton
      }
      .padding(JovieSpacing.large)
    }
    .scrollIndicators(.hidden)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(JovieColor.surface0)
    .accessibilityIdentifier("settings-view")
  }

  private var header: some View {
    HStack(spacing: JovieSpacing.medium) {
      Text("Settings")
        .font(JovieFont.display(size: 22))
        .foregroundStyle(JovieColor.textPrimary)

      Spacer()

      if let onClose {
        Button(action: onClose) {
          Image(systemName: "xmark")
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Close Settings")
      }
    }
  }

  private var accountSection: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.medium) {
      SettingsSectionTitle("Account")

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
      .padding(JovieSpacing.medium)
      .jovieSurface(radius: JovieRadius.medium)
    }
  }

  private var linksSection: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.medium) {
      SettingsSectionTitle("Jovie")

      VStack(spacing: 0) {
        SettingsLinkRow(title: "Support", systemImage: "questionmark.circle") {
          openURL(URL(string: "https://jov.ie/support")!)
        }

        SettingsDivider()

        SettingsLinkRow(title: "Privacy", systemImage: "hand.raised") {
          openURL(URL(string: "https://jov.ie/legal/privacy")!)
        }

        SettingsDivider()

        SettingsLinkRow(title: "Terms", systemImage: "doc.text") {
          openURL(URL(string: "https://jov.ie/legal/terms")!)
        }
      }
      .padding(.vertical, JovieSpacing.xSmall)
      .jovieSurface(radius: JovieRadius.medium)
    }
  }

  private var buildSection: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.medium) {
      SettingsSectionTitle("App")

      VStack(spacing: 0) {
        SettingsValueRow(title: "Version", value: buildInfo.version)
        SettingsDivider()
        SettingsValueRow(title: "Build", value: buildInfo.build)
      }
      .padding(.vertical, JovieSpacing.xSmall)
      .jovieSurface(radius: JovieRadius.medium)
    }
  }

  private var logoutButton: some View {
    Button {
      guard !isLoggingOut else { return }
      isLoggingOut = true

      Task {
        await onLogout()
        isLoggingOut = false
      }
    } label: {
      Label(isLoggingOut ? "Logging Out" : "Log Out", systemImage: "rectangle.portrait.and.arrow.right")
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(JoviePillButtonStyle(filled: false))
    .disabled(isLoggingOut)
    .accessibilityLabel("Log Out")
  }
}

private struct SettingsSectionTitle: View {
  let title: String

  init(_ title: String) {
    self.title = title
  }

  var body: some View {
    Text(title)
      .font(JovieFont.body(size: 12, weight: .semibold))
      .foregroundStyle(JovieColor.textTertiary)
      .textCase(.uppercase)
  }
}

private struct SettingsLinkRow: View {
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
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
      .padding(.vertical, 12)
    }
    .buttonStyle(.plain)
  }
}

private struct SettingsValueRow: View {
  let title: String
  let value: String

  var body: some View {
    HStack {
      Text(title)
        .foregroundStyle(JovieColor.textSecondary)

      Spacer()

      Text(value)
        .foregroundStyle(JovieColor.textTertiary)
    }
    .font(JovieFont.body(size: 14, weight: .medium))
    .padding(.horizontal, JovieSpacing.medium)
    .padding(.vertical, 12)
  }
}

private struct SettingsDivider: View {
  var body: some View {
    Rectangle()
      .fill(JovieColor.borderSubtle)
      .frame(height: 1)
      .padding(.leading, JovieSpacing.medium)
  }
}
