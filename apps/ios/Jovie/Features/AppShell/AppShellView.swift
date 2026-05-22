import SwiftUI

enum AppShellPanel: Equatable {
  case sidebar
  case main
  case settings
}

struct AppShellProfile: Equatable {
  let displayName: String
  let username: String?
  let publicProfileURL: String?
  let avatarURL: URL?

  init(response: MobileMeResponse?) {
    displayName = response?.displayName ?? response?.username ?? "Jovie"
    username = response?.username
    publicProfileURL = response?.publicProfileURL
    avatarURL = response?.avatarURL.flatMap(URL.init(string:))
  }

  var secondaryText: String {
    if let username, !username.isEmpty {
      return "@\(username)"
    }

    return publicProfileURL ?? "Profile setup pending"
  }
}

struct AppShellView<MainContent: View>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let initialPanel: AppShellPanel
  let onLogout: @MainActor () async -> Void
  @ViewBuilder let mainContent: MainContent

  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @State private var compactPanel: AppShellPanel

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialPanel: AppShellPanel = .main,
    onLogout: @escaping @MainActor () async -> Void,
    @ViewBuilder mainContent: () -> MainContent
  ) {
    self.profile = profile
    self.isOffline = isOffline
    self.initialPanel = initialPanel
    self.onLogout = onLogout
    self.mainContent = mainContent()
    _compactPanel = State(initialValue: initialPanel)
  }

  var body: some View {
    GeometryReader { geometry in
      if usesRegularLayout(width: geometry.size.width) {
        regularLayout
      } else {
        compactLayout(width: geometry.size.width)
      }
    }
    .background(JovieColor.backgroundBase)
  }

  private var regularLayout: some View {
    HStack(spacing: 0) {
      AppSidebarView(profile: profile, isOffline: isOffline)
        .frame(width: 232)

      shellDivider

      mainContent
        .frame(maxWidth: .infinity, maxHeight: .infinity)

      shellDivider

      SettingsView(
        profile: profile,
        buildInfo: .current(),
        onLogout: onLogout
      )
      .frame(width: 320)
    }
    .ignoresSafeArea(.keyboard)
  }

  private func compactLayout(width: CGFloat) -> some View {
    ZStack {
      mainContent
        .safeAreaInset(edge: .top, spacing: 0) {
          compactToolbar
        }
        .accessibilityIdentifier("shell-main")

      compactScrim

      if compactPanel == .sidebar {
        HStack(spacing: 0) {
          AppSidebarView(
            profile: profile,
            isOffline: isOffline,
            onClose: { setCompactPanel(.main) }
          )
          .frame(width: min(width * 0.82, 320))
          .transition(.move(edge: .leading))

          Spacer(minLength: 0)
        }
        .zIndex(2)
      }

      if compactPanel == .settings {
        HStack(spacing: 0) {
          Spacer(minLength: 0)

          SettingsView(
            profile: profile,
            buildInfo: .current(),
            onClose: { setCompactPanel(.main) },
            onLogout: onLogout
          )
          .frame(width: min(width * 0.86, 360))
          .transition(.move(edge: .trailing))
        }
        .zIndex(2)
      }
    }
    .contentShape(Rectangle())
    .simultaneousGesture(edgeSwipe(width: width))
  }

  private var compactToolbar: some View {
    HStack {
      Button {
        setCompactPanel(.sidebar)
      } label: {
        Image(systemName: "sidebar.left")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Open Sidebar")

      Spacer()

      Button {
        setCompactPanel(.settings)
      } label: {
        Image(systemName: "gearshape")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Open Settings")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.small)
    .background(JovieColor.backgroundBase.opacity(0.94))
  }

  @ViewBuilder
  private var compactScrim: some View {
    if compactPanel != .main {
      Color.black.opacity(0.48)
        .ignoresSafeArea()
        .onTapGesture {
          setCompactPanel(.main)
        }
        .transition(.opacity)
        .zIndex(1)
    }
  }

  private var shellDivider: some View {
    Rectangle()
      .fill(JovieColor.borderSubtle)
      .frame(width: 1)
  }

  private func edgeSwipe(width: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 28)
      .onEnded { value in
        let horizontal = value.translation.width
        guard abs(horizontal) > 64, abs(horizontal) > abs(value.translation.height) else {
          return
        }

        if horizontal > 0 {
          if compactPanel == .settings {
            setCompactPanel(.main)
          } else if value.startLocation.x <= 44 || compactPanel == .main {
            setCompactPanel(.sidebar)
          }
        } else if horizontal < 0 {
          if compactPanel == .sidebar {
            setCompactPanel(.main)
          } else if value.startLocation.x >= width - 44 || compactPanel == .main {
            setCompactPanel(.settings)
          }
        }
      }
  }

  private func setCompactPanel(_ panel: AppShellPanel) {
    withAnimation(.easeOut(duration: 0.18)) {
      compactPanel = panel
    }
  }

  private func usesRegularLayout(width: CGFloat) -> Bool {
    horizontalSizeClass == .regular && width >= 820
  }
}

private struct AppSidebarView: View {
  let profile: AppShellProfile
  let isOffline: Bool
  var onClose: (() -> Void)?

  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      HStack(spacing: JovieSpacing.medium) {
        Image("Jovie-logo")
          .resizable()
          .scaledToFit()
          .frame(width: 28, height: 28)
          .clipShape(RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous))

        Text("Jovie")
          .font(JovieFont.display(size: 18))
          .foregroundStyle(JovieColor.textPrimary)

        Spacer()

        if let onClose {
          Button(action: onClose) {
            Image(systemName: "xmark")
          }
          .buttonStyle(JovieIconButtonStyle())
          .accessibilityLabel("Close Sidebar")
        }
      }

      SidebarAccountView(profile: profile, isOffline: isOffline)

      VStack(spacing: JovieSpacing.small) {
        SidebarRow(title: "Dashboard", systemImage: "qrcode.viewfinder", isSelected: true) {}

        SidebarRow(title: "Profile", systemImage: "person.crop.circle", isSelected: false) {
          guard let value = profile.publicProfileURL, let url = URL(string: value) else {
            return
          }

          openURL(url)
        }
        .disabled(profile.publicProfileURL == nil)
      }

      Spacer(minLength: 0)
    }
    .padding(JovieSpacing.large)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(JovieColor.surface0)
    .accessibilityIdentifier("shell-sidebar")
  }
}

private struct SidebarAccountView: View {
  let profile: AppShellProfile
  let isOffline: Bool

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      DashboardAvatarView(
        name: profile.displayName,
        avatarURL: profile.avatarURL
      )

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(profile.displayName)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        Text(isOffline ? "Offline" : profile.secondaryText)
          .font(JovieFont.body(size: 12, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
          .lineLimit(1)
      }
    }
    .padding(JovieSpacing.medium)
    .jovieSurface(radius: JovieRadius.medium)
  }
}

private struct SidebarRow: View {
  let title: String
  let systemImage: String
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: systemImage)
          .frame(width: 18)

        Text(title)
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .font(JovieFont.body(size: 14, weight: .semibold))
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textSecondary)
      .padding(.horizontal, JovieSpacing.medium)
      .padding(.vertical, 11)
      .background(
        isSelected ? JovieColor.surface1 : Color.clear,
        in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
      )
    }
    .buttonStyle(.plain)
  }
}
