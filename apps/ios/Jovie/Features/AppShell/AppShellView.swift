import SwiftUI

enum AppShellTab: Equatable {
  case chat
  case profile

  var accessibilityID: String {
    switch self {
    case .chat:
      return "shell-tab-chat"
    case .profile:
      return "shell-tab-profile"
    }
  }

  var title: String {
    switch self {
    case .chat:
      return "Chat"
    case .profile:
      return "Profile"
    }
  }

  var systemImage: String {
    switch self {
    case .chat:
      return "sparkles"
    case .profile:
      return "qrcode.viewfinder"
    }
  }
}

private enum AppShellRoute: Hashable {
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

struct AppShellView<ProfileContent: View, ChatContent: View>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let opensSettingsOnLaunch: Bool
  let billingURL: URL
  let onLogout: @MainActor () async -> Void
  @ViewBuilder let profileContent: ProfileContent
  @ViewBuilder let chatContent: ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingMenu = false
  @State private var didOpenLaunchSettings = false

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .profile,
    opensSettingsOnLaunch: Bool = false,
    billingURL: URL,
    onLogout: @escaping @MainActor () async -> Void,
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder chatContent: () -> ChatContent
  ) {
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
    self.billingURL = billingURL
    self.onLogout = onLogout
    self.profileContent = profileContent()
    self.chatContent = chatContent()
    _selectedTab = State(initialValue: initialTab)
  }

  var body: some View {
    NavigationStack(path: $navigationPath) {
      ZStack {
        JovieColor.backgroundBase.ignoresSafeArea()

        activeContent
          .safeAreaInset(edge: .top, spacing: 0) {
            shellToolbar
          }
          .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomNavigation
          }
      }
      .navigationBarHidden(true)
      .navigationDestination(for: AppShellRoute.self) { route in
        switch route {
        case .settings:
          SettingsView(
            profile: profile,
            buildInfo: .current(),
            billingURL: billingURL,
            onLogout: onLogout
          )
          .navigationBarBackButtonHidden()
        }
      }
    }
    .background(JovieColor.backgroundBase)
    .contentShape(Rectangle())
    .simultaneousGesture(edgeSwipe)
    .fullScreenCover(isPresented: $isShowingMenu) {
      AppNavigationMenu(
        profile: profile,
        isOffline: isOffline,
        selectedTab: selectedTab,
        onSelectTab: { tab in
          selectedTab = tab
          isShowingMenu = false
        },
        onOpenSettings: {
          isShowingMenu = false
          navigationPath.append(.settings)
        },
        onClose: { isShowingMenu = false }
      )
    }
    .task(id: opensSettingsOnLaunch) {
      guard opensSettingsOnLaunch, didOpenLaunchSettings == false else { return }
      didOpenLaunchSettings = true
      await Task.yield()
      navigationPath.append(.settings)
    }
  }

  @ViewBuilder
  private var activeContent: some View {
    switch selectedTab {
    case .chat:
      chatContent
    case .profile:
      profileContent
    }
  }

  private var shellToolbar: some View {
    HStack(spacing: JovieSpacing.medium) {
      Button {
        isShowingMenu = true
      } label: {
        Image(systemName: "line.3.horizontal")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Open Menu")

      VStack(spacing: 2) {
        Text(selectedTab.title)
          .font(JovieFont.body(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        if isOffline {
          Text("Offline")
            .font(JovieFont.body(size: 11, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
        }
      }
      .frame(maxWidth: .infinity)

      Button {
        if selectedTab == .chat {
          selectedTab = .profile
        } else {
          navigationPath.append(.settings)
        }
      } label: {
        Image(systemName: selectedTab == .chat ? "qrcode.viewfinder" : "gearshape")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel(selectedTab == .chat ? "Open Profile" : "Open Settings")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.small)
    .background(JovieColor.backgroundBase.opacity(0.96))
  }

  private var bottomNavigation: some View {
    HStack(spacing: JovieSpacing.small) {
      tabButton(.chat)
      tabButton(.profile)
    }
    .padding(6)
    .frame(width: 236)
    .background {
      if #available(iOS 26.0, *) {
        Capsule(style: .continuous)
          .fill(JovieColor.surface1.opacity(0.54))
          .glassEffect(.regular.tint(JovieColor.surface1.opacity(0.54)), in: .rect(cornerRadius: 28))
      } else {
        Capsule(style: .continuous)
          .fill(.ultraThinMaterial)
          .overlay {
            Capsule(style: .continuous)
              .stroke(JovieColor.borderDefault, lineWidth: 1)
          }
      }
    }
    .padding(.bottom, JovieSpacing.medium)
  }

  private func tabButton(_ tab: AppShellTab) -> some View {
    let isSelected = selectedTab == tab

    return Button {
      selectedTab = tab
    } label: {
      HStack(spacing: JovieSpacing.small) {
        Image(systemName: tab.systemImage)
          .font(.system(size: 15, weight: .semibold))

        Text(tab.title)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .lineLimit(1)
      }
      .foregroundStyle(isSelected ? JovieColor.backgroundBase : JovieColor.textSecondary)
      .frame(maxWidth: .infinity)
      .frame(height: 42)
      .background(
        isSelected ? Color.white : Color.clear,
        in: Capsule(style: .continuous)
      )
      .contentShape(Capsule(style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(tab.title)
    .accessibilityIdentifier(tab.accessibilityID)
  }

  private var edgeSwipe: some Gesture {
    DragGesture(minimumDistance: 30)
      .onEnded { value in
        let horizontal = value.translation.width
        guard abs(horizontal) > 72, abs(horizontal) > abs(value.translation.height) else {
          return
        }

        if horizontal > 0, value.startLocation.x <= 52 {
          isShowingMenu = true
        } else if horizontal < 0 {
          selectedTab = .profile
        }
      }
  }
}

private struct AppNavigationMenu: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let selectedTab: AppShellTab
  let onSelectTab: (AppShellTab) -> Void
  let onOpenSettings: () -> Void
  let onClose: () -> Void

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
        HStack {
          Text("Jovie")
            .font(JovieFont.display(size: 30))
            .foregroundStyle(JovieColor.textPrimary)

          Spacer()

          Button(action: onClose) {
            Image(systemName: "xmark")
          }
          .buttonStyle(JovieIconButtonStyle())
          .accessibilityLabel("Close Menu")
        }

        MenuAccountView(profile: profile, isOffline: isOffline)

        VStack(spacing: JovieSpacing.small) {
          MenuRow(
            title: "Chat",
            systemImage: AppShellTab.chat.systemImage,
            isSelected: selectedTab == .chat
          ) {
            onSelectTab(.chat)
          }

          MenuRow(
            title: "Profile",
            systemImage: AppShellTab.profile.systemImage,
            isSelected: selectedTab == .profile
          ) {
            onSelectTab(.profile)
          }

          MenuRow(
            title: "Settings",
            systemImage: "gearshape",
            isSelected: false,
            action: onOpenSettings
          )
        }

        VStack(alignment: .leading, spacing: JovieSpacing.medium) {
          Text("Recent")
            .font(JovieFont.body(size: 13, weight: .semibold))
            .foregroundStyle(JovieColor.textTertiary)

          Text("Conversations will appear here when mobile chat is enabled.")
            .font(JovieFont.body(size: 15))
            .foregroundStyle(JovieColor.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, JovieSpacing.medium)

        Spacer(minLength: 0)
      }
      .padding(.horizontal, JovieSpacing.xLarge)
      .padding(.top, JovieSpacing.xxLarge)
      .padding(.bottom, JovieSpacing.xLarge)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .accessibilityIdentifier("shell-menu")
  }
}

private struct MenuAccountView: View {
  let profile: AppShellProfile
  let isOffline: Bool

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      DashboardAvatarView(
        name: profile.displayName,
        avatarURL: profile.avatarURL
      )
      .frame(width: 36, height: 36)

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(profile.displayName)
          .font(JovieFont.body(size: 15, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        Text(isOffline ? "Offline" : profile.secondaryText)
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
          .lineLimit(1)
      }

      Spacer(minLength: 0)
    }
  }
}

private struct MenuRow: View {
  let title: String
  let systemImage: String
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: systemImage)
          .frame(width: 22)

        Text(title)
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .font(JovieFont.body(size: 18, weight: .semibold))
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textSecondary)
      .padding(.vertical, 13)
      .padding(.horizontal, JovieSpacing.medium)
      .background(
        isSelected ? JovieColor.surface1 : Color.clear,
        in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
  }
}
