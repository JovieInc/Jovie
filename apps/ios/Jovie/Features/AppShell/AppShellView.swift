import AVKit
import SwiftUI

enum AppShellTab: Equatable, Hashable {
  case chat
  case library
  case calendar
  case inbox
  case profile
  case audience

  var accessibilityID: String {
    switch self {
    case .chat: return "shell-tab-chat"
    case .library: return "shell-tab-library"
    case .calendar: return "shell-tab-calendar"
    case .inbox: return "shell-tab-inbox"
    case .profile: return "shell-tab-profile"
    case .audience: return "shell-tab-audience"
    }
  }

  var title: String {
    switch self {
    case .chat: return "Chat"
    case .library: return "Library"
    case .calendar: return "Calendar"
    case .inbox: return "Inbox"
    case .profile: return "Profile"
    case .audience: return "Audience"
    }
  }

  var systemImage: String {
    switch self {
    case .chat: return "sparkles"
    case .library: return "square.stack"
    case .calendar: return "calendar"
    case .inbox: return "tray"
    case .profile: return "qrcode.viewfinder"
    case .audience: return "person.3"
    }
  }

}

// File-level so unit tests can call it without importing SwiftUI.
func resolveShellInitialTab(_ initialTab: AppShellTab, chatEnabled: Bool) -> AppShellTab {
  switch initialTab {
  case .chat, .library, .calendar, .inbox:
    return chatEnabled ? initialTab : .profile
  case .audience, .profile:
    return initialTab
  }
}

// GH-12949: the recessed drawer base plane must be fully invisible while closed.
func appShellDrawerIsPresented(
  isShowingDrawer: Bool,
  drawerDragOffset: CGFloat
) -> Bool {
  isShowingDrawer || drawerDragOffset != 0
}

func appShellDrawerBasePlaneOpacity(
  isShowingDrawer: Bool,
  drawerDragOffset: CGFloat
) -> Double {
  appShellDrawerIsPresented(
    isShowingDrawer: isShowingDrawer,
    drawerDragOffset: drawerDragOffset
  ) ? 1 : 0
}

// File-level so unit tests can assert the shipped keep-mounted policy.
func appShellKeepsChatMountedAcrossTabs() -> Bool {
  true
}

// Chat stays in the tree for every tab when chat is enabled so
// MobileChatView.task does not re-run refreshConversations().
func appShellShowsChatUnderlay(selectedTab: AppShellTab, chatEnabled: Bool) -> Bool {
  guard chatEnabled, appShellKeepsChatMountedAcrossTabs() else { return false }
  switch selectedTab {
  case .chat, .library, .calendar, .inbox, .profile, .audience:
    return true
  }
}

func appShellRightRailOpacity(isShowing: Bool, dragOffset: CGFloat) -> Double {
  (isShowing || dragOffset != 0) ? 1 : 0
}

func appShellHomeSurface(chatEnabled: Bool) -> AppShellTab {
  AppShellPanePolicy.homeSurface(chatEnabled: chatEnabled)
}

struct AppShellProfile: Equatable {
  let displayName: String
  let username: String?
  let publicProfileURL: String?
  let qrPayload: String?
  let avatarURL: URL?

  init(response: MobileMeResponse?) {
    displayName = response?.displayName ?? response?.username ?? "Jovie"
    username = response?.username
    publicProfileURL = response?.publicProfileURL
    qrPayload = response?.qrPayload
    avatarURL = response?.avatarURL.flatMap(URL.init(string:))
  }

  var secondaryText: String {
    if let username, !username.isEmpty {
      return "@\(username)"
    }

    return publicProfileURL ?? "Profile setup pending"
  }
}

/// Chat-first shell (JOV-5201): home content → swipe rails → overlays.
/// No bottom tab bar. Leading pan = sidebar, trailing pan = right rail.
struct AppShellView<
  ProfileContent: View,
  AudienceContent: View,
  LibraryContent: View,
  CalendarContent: View,
  InboxContent: View,
  ChatContent: View
>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let opensSettingsOnLaunch: Bool
  let webBaseURL: URL
  let accountURL: URL
  let billingURL: URL
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let recentConversations: [MobileConversationSummary]
  let isLoadingConversations: Bool
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void
  let onStartNewChat: () -> Void
  let onAutoSendMessage: (String) -> Void
  let onEyesFreeSubmit: (EyesFreeCaptureLaunch, String) -> Void
  let onLogout: @MainActor () async -> Void
  let showsWorkspaceSwitch: Bool
  let workspaceMode: MobileWorkspaceMode
  let onSelectWorkspace: (MobileWorkspaceMode) -> Void
  @ViewBuilder let profileContent: ProfileContent
  @ViewBuilder let audienceContent: (_ askJovie: @escaping (String) -> Void) -> AudienceContent
  @ViewBuilder let libraryContent: (
    _ onSelectAsset: @escaping (LibraryAsset) -> Void,
    _ home: Binding<LibraryHome>
  ) -> LibraryContent
  @ViewBuilder let calendarContent: (_ askJovie: @escaping (String) -> Void) -> CalendarContent
  @ViewBuilder let inboxContent: (_ askJovie: @escaping (String) -> Void) -> InboxContent
  let chatContent: (
    Binding<String>,
    Binding<Int>,
    @escaping (EntityContextItem) -> Void,
    @escaping (MobileChatVideoProposalPayload) -> Void
  ) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var isShowingSettings = false
  @State private var isShowingDrawer = false
  @State private var drawerDragOffset: CGFloat = 0
  @State private var isShowingRightRail = false
  @State private var railDragOffset: CGFloat = 0
  @State private var railSwipeExclusionStore = AppShellRailSwipeExclusionStore()
  @State private var isRailGestureBlockedForCurrentDrag = false
  @GestureState private var isRailGestureActive = false
  @State private var isKeyboardVisible = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
  @State private var voiceCaptureTrigger = 0
  @State private var isShowingTalkOverlay = false
  @State private var talkAutoSubmit = false
  @State private var talkUnavailableMessage: String?
  @State private var eyesFreeLaunch: EyesFreeCaptureLaunch?
  @State private var talkVoiceService = VoiceCaptureService()
  @State private var teleprompterProposal: MobileChatVideoProposalPayload?
  @State private var libraryHome: LibraryHome = .catalog
  @State private var selectedLibraryAsset: LibraryAsset?
  @State private var videoPlaybackAsset: LibraryAsset?
  @State private var publicProfileBrowserItem: PublicProfileBrowserDestination?
  @State private var isShowingProfileQR = false
  @State private var entityContext: EntityContextItem?
  @State private var lastEntityContext: EntityContextItem?
  @State private var intentStore = IntentNavigationStore.shared
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
#if DEBUG
  @State private var didExposeInteractiveRailProgressForUITest = false
#endif

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .chat,
    opensSettingsOnLaunch: Bool = false,
    webBaseURL: URL,
    accountURL: URL,
    billingURL: URL,
    chatEnabled: Bool = false,
    audienceEnabled: Bool = true,
    recentConversations: [MobileConversationSummary] = [],
    isLoadingConversations: Bool = false,
    activeConversationID: String? = nil,
    onSelectConversation: @escaping (String) -> Void = { _ in },
    onStartNewChat: @escaping () -> Void = {},
    onAutoSendMessage: @escaping (String) -> Void = { _ in },
    onEyesFreeSubmit: @escaping (EyesFreeCaptureLaunch, String) -> Void = { _, _ in },
    onLogout: @escaping @MainActor () async -> Void,
    showsWorkspaceSwitch: Bool = false,
    workspaceMode: MobileWorkspaceMode = .jovie,
    onSelectWorkspace: @escaping (MobileWorkspaceMode) -> Void = { _ in },
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder audienceContent: @escaping (_ askJovie: @escaping (String) -> Void) -> AudienceContent,
    @ViewBuilder libraryContent: @escaping (
      _ onSelectAsset: @escaping (LibraryAsset) -> Void,
      _ home: Binding<LibraryHome>
    ) -> LibraryContent = { _, _ in EmptyView() },
    @ViewBuilder calendarContent: @escaping (_ askJovie: @escaping (String) -> Void) -> CalendarContent = { _ in
      EmptyView()
    },
    @ViewBuilder inboxContent: @escaping (_ askJovie: @escaping (String) -> Void) -> InboxContent = { _ in
      EmptyView()
    },
    @ViewBuilder chatContent: @escaping (
      Binding<String>,
      Binding<Int>,
      @escaping (EntityContextItem) -> Void,
      @escaping (MobileChatVideoProposalPayload) -> Void
    ) -> ChatContent
  ) {
    let opensTeleprompterFixture = ProcessInfo.processInfo.arguments.contains(
      "-ui-testing-teleprompter"
    )
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
    self.webBaseURL = webBaseURL
    self.accountURL = accountURL
    self.billingURL = billingURL
    self.chatEnabled = chatEnabled
    self.audienceEnabled = audienceEnabled
    self.recentConversations = recentConversations
    self.isLoadingConversations = isLoadingConversations
    self.activeConversationID = activeConversationID
    self.onSelectConversation = onSelectConversation
    self.onStartNewChat = onStartNewChat
    self.onAutoSendMessage = onAutoSendMessage
    self.onEyesFreeSubmit = onEyesFreeSubmit
    self.onLogout = onLogout
    self.showsWorkspaceSwitch = showsWorkspaceSwitch
    self.workspaceMode = workspaceMode
    self.onSelectWorkspace = onSelectWorkspace
    self.profileContent = profileContent()
    self.audienceContent = audienceContent
    self.libraryContent = libraryContent
    self.calendarContent = calendarContent
    self.inboxContent = inboxContent
    self.chatContent = chatContent
    _teleprompterProposal = State(
      initialValue: opensTeleprompterFixture
        ? MobileChatVideoProposalPayload(
          kind: .bts,
          title: "What changed the moment you stepped onto the ferry?",
          script: "Tell the story in your own words."
        )
        : nil
    )
    _selectedTab = State(
      initialValue: Self.resolvedInitialTab(initialTab: initialTab, chatEnabled: chatEnabled)
    )
  }

  var body: some View {
    NavigationStack {
      GeometryReader { proxy in
        let openOffset = drawerOpenOffset(safeAreaLeading: proxy.safeAreaInsets.leading)
        let isDrawerPresented = appShellDrawerIsPresented(
          isShowingDrawer: isShowingDrawer,
          drawerDragOffset: drawerDragOffset
        )

        // Layer stack (bottom → top): drawer rail → home → right rail → overlays.
        ZStack(alignment: .leading) {
          AppShellLeftDrawer(
            isPresented: isDrawerPresented,
            profile: profile,
            chatEnabled: chatEnabled,
            audienceEnabled: audienceEnabled,
            selectedTab: selectedTab,
            recentConversations: recentConversations,
            isLoadingConversations: isLoadingConversations,
            activeConversationID: activeConversationID,
            drawerWidth: drawerWidth,
            reduceMotion: isReduceMotionEnabled,
            onSelectTab: { tab in
              closeDrawerThenSelect(tab)
            },
            onStartNewChat: {
              closeDrawer()
              startNewChat()
            },
            onSelectConversation: { conversationID in
              closeDrawer()
              onSelectConversation(conversationID)
              selectTab(.chat)
            },
            onOpenSettings: {
              closeDrawer()
              // Commit the pane dismissal before asking SwiftUI to present
              // the full-screen cover. Presenting in the same transaction as
              // the animated drawer close can drop the cover request.
              DispatchQueue.main.async {
                isShowingSettings = true
              }
            },
            onTalk: {
              closeDrawer()
              openTalkOverlay()
            },
            onOpenPublicProfile: {
              openPublicProfile()
            },
            onOpenProfileQR: {
              openProfileQR()
            }
          )
          .opacity(
            appShellDrawerBasePlaneOpacity(
              isShowingDrawer: isShowingDrawer,
              drawerDragOffset: drawerDragOffset
            )
          )
          .animation(drawerAnimation, value: isShowingDrawer)
          .accessibilityHidden(!isDrawerPresented)

          shellContent
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .offset(x: contentOffset(openOffset: openOffset, railOpenOffset: railWidth))
            .animation(isReduceMotionEnabled ? nil : drawerAnimation, value: isShowingDrawer)
            .animation(isReduceMotionEnabled ? nil : drawerAnimation, value: isShowingRightRail)

          AppShellRightRail(
            item: lastEntityContext,
            onTalk: openTalkOverlay,
            onEditInChat: { prompt in
              applyOpenPane(.none)
              chatDraft = prompt
              selectTab(.chat)
            },
            onClose: { applyOpenPane(.none) }
          )
          .frame(width: railWidth)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
          .offset(x: rightRailOffset(railOpenOffset: railWidth))
          .opacity(
            appShellRightRailOpacity(
              isShowing: isShowingRightRail,
              dragOffset: isReduceMotionEnabled ? 0 : railDragOffset
            )
          )
          .animation(isReduceMotionEnabled ? nil : drawerAnimation, value: isShowingRightRail)
          .accessibilityHidden(!isShowingRightRail && railDragOffset == 0)
          .allowsHitTesting(isShowingRightRail)

          if isShowingTalkOverlay, chatEnabled || talkUnavailableMessage != nil {
            TalkOverlayView(
              voiceCaptureService: talkVoiceService,
              onCancel: {
                isShowingTalkOverlay = false
                talkAutoSubmit = false
                talkUnavailableMessage = nil
                eyesFreeLaunch = nil
              },
              onInsertDraft: { transcript in
                // Recovery-only handoff: a failed direct completion may preserve
                // the transcript as an editable composer draft (#10380).
                let handoff = VoiceMemoActionDraft.shellHandoff(fromTranscript: transcript)
                isShowingTalkOverlay = false
                talkAutoSubmit = false
                selectTab(.chat)
                chatDraft = handoff.chatDraft
                // Recovery drafts never auto-send.
              },
              autoSubmit: talkAutoSubmit,
              unavailableMessage: talkUnavailableMessage,
              listeningCue: eyesFreeLaunch?.destination.listeningCue
                ?? EyesFreeCaptureDestination.jovie.listeningCue,
              onSubmit: { transcript in
                let launch = eyesFreeLaunch ?? EyesFreeCaptureLaunch(
                  destination: .jovie,
                  spokenText: transcript,
                  idempotencyKey: UUID().uuidString
                )
                isShowingTalkOverlay = false
                talkAutoSubmit = false
                talkUnavailableMessage = nil
                selectTab(.chat)
                onEyesFreeSubmit(launch, transcript)
              }
            )
            .transition(.opacity)
            .zIndex(10)
          }

          if let teleprompterProposal {
            TeleprompterOverlayView(
              viewModel: teleprompterViewModel(for: teleprompterProposal),
              onClose: {
                self.teleprompterProposal = nil
              }
            )
            .transition(.opacity)
            .zIndex(11)
          }

#if DEBUG
          if isReduceMotionUITest {
            Text("Reduce Motion Active")
              .font(.system(size: 1))
              .frame(width: 1, height: 1)
              .clipped()
              .accessibilityIdentifier("shell-reduce-motion-status")
              .accessibilityValue(
                didExposeInteractiveRailProgressForUITest
                  ? "Interactive progress exposed"
                  : "Interactive progress hidden"
              )
              .allowsHitTesting(false)
          }
#endif
        }
        .simultaneousGesture(
          edgeRailGesture(
            openOffset: openOffset,
            containerWidth: proxy.size.width
          )
        )
        .coordinateSpace(name: "app-shell")
        .onPreferenceChange(AppShellRailSwipeExclusionFramesKey.self) { frames in
          railSwipeExclusionStore.frames = frames
        }
        .onChange(of: isRailGestureActive) { _, isActive in
          guard !isActive else { return }
          // GestureState resets on both completion and cancellation. Defer the
          // cleanup so onEnded can still inspect the latched eligibility bit.
          DispatchQueue.main.async {
            guard !isRailGestureActive else { return }
            isRailGestureBlockedForCurrentDrag = false
            resetRailDragOffsets()
          }
        }
        .onChange(of: drawerDragOffset) { _, offset in
          recordInteractiveRailProgressForUITest(offset)
        }
        .onChange(of: railDragOffset) { _, offset in
          recordInteractiveRailProgressForUITest(offset)
        }
      }
      .navigationBarHidden(true)
    }
    .background(JovieColor.backgroundBase)
    .sheet(item: $entityContext) { item in
      EntityContextSheet(
        item: item,
        onEditInChat: { prompt in
          entityContext = nil
          applyOpenPane(.none)
          chatDraft = prompt
          selectTab(.chat)
        },
        onDismiss: { entityContext = nil }
      )
    }
    .sheet(item: $videoPlaybackAsset) { asset in
      if let url = asset.localVideoURL {
        VideoPlayer(player: AVPlayer(url: url))
          .ignoresSafeArea()
          .background(Color.black)
          .accessibilityIdentifier("library-video-player")
      }
    }
    .fullScreenCover(item: $publicProfileBrowserItem) { destination in
      PublicProfileBrowserView(initialURL: destination.url, policy: destination.policy)
    }
    .fullScreenCover(isPresented: $isShowingProfileQR) {
      if let payload = profile.qrPayload {
        VenueModeView(
          qrPayload: payload,
          brightnessManager: ScreenBrightnessManager(),
          onDismiss: { isShowingProfileQR = false }
        )
      }
    }
    .fullScreenCover(isPresented: $isShowingSettings) {
      NavigationStack {
        SettingsView(
          profile: profile,
          buildInfo: .current(),
          accountURL: accountURL,
          billingURL: billingURL,
          onClose: { isShowingSettings = false },
          onLogout: onLogout,
          showsWorkspaceSwitch: showsWorkspaceSwitch,
          workspaceMode: workspaceMode,
          onSelectWorkspace: onSelectWorkspace
        )
        .navigationBarBackButtonHidden()
      }
    }
    .task(id: opensSettingsOnLaunch) {
      guard opensSettingsOnLaunch, didOpenLaunchSettings == false else { return }
      didOpenLaunchSettings = true
      await Task.yield()
      isShowingSettings = true
    }
    .task {
      applyPendingIntentNavigation()
    }
    .onChange(of: intentStore.pending) {
      applyPendingIntentNavigation()
    }
    .onContinueUserActivity(ConversationUserActivity.activityType) { activity in
      guard let payload = ConversationUserActivity.payload(from: activity.userInfo ?? [:]) else {
        return
      }
      intentStore.submit(.openConversation(payload.conversationID))
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      isKeyboardVisible = true
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      isKeyboardVisible = false
    }
    .onChange(of: voiceCaptureTrigger) {
      guard voiceCaptureTrigger > 0, chatEnabled else { return }
      openTalkOverlay()
    }
  }

  // Elevated content plane: toolbar + page ride together so the drawer
  // transform reads as one spatial move. No bottom tab bar (JOV-5201).
  private var shellContent: some View {
    let isElevated = isShowingDrawer || drawerDragOffset != 0
      || isShowingRightRail || railDragOffset != 0

    return ZStack {
      ZStack {
        JovieColor.backgroundBase.ignoresSafeArea()

        pagedContent
          .transition(pageTransition)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .clipped()
      }
      .safeAreaInset(edge: .top, spacing: 0) {
        shellToolbar
      }
      .allowsHitTesting(!isElevated && !isShowingTalkOverlay && teleprompterProposal == nil)
      .accessibilityHidden(isElevated || isShowingTalkOverlay || teleprompterProposal != nil)

      if isElevated {
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture { closeDrawer() }
          .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(JovieColor.backgroundBase)
    .clipShape(shellContentClipShape(isElevated: isElevated))
    .background {
      if !isElevated {
        JovieColor.backgroundBase.ignoresSafeArea(edges: .bottom)
      }
    }
    .overlay(alignment: .leading) {
      if isElevated {
        Rectangle()
          .fill(JovieColor.borderSubtle)
          .frame(width: 1)
      }
    }
    .shadow(color: .black.opacity(isElevated ? 0.28 : 0), radius: 24, x: 8)
  }

  private func shellContentClipShape(isElevated: Bool) -> AnyShape {
    if isElevated {
      return AnyShape(RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous))
    }
    return AnyShape(Rectangle())
  }

  private func applyPendingIntentNavigation() {
    var state = AppShellIntentNavigationState(
      selectedTab: selectedTab,
      chatDraft: chatDraft,
      autoSendMessage: nil,
      shouldStartVoiceCapture: false,
      talkAutoSubmit: false,
      eyesFreeLaunch: nil,
      unavailableMessage: nil,
      openConversationID: nil,
      pendingRequest: intentStore.consume()
    )
    let previousTab = selectedTab

    guard AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: chatEnabled,
      canUseSummer: showsWorkspaceSwitch,
      isOffline: isOffline,
      state: &state
    ) else { return }

    chatDraft = state.chatDraft
    talkAutoSubmit = state.talkAutoSubmit
    eyesFreeLaunch = state.eyesFreeLaunch
    talkUnavailableMessage = state.unavailableMessage

    if let launch = state.eyesFreeLaunch,
       let autoSendMessage = state.autoSendMessage,
       state.talkAutoSubmit
    {
      onEyesFreeSubmit(launch, autoSendMessage)
    } else if let autoSendMessage = state.autoSendMessage {
      onAutoSendMessage(autoSendMessage)
    }

    if let conversationID = state.openConversationID {
      onSelectConversation(conversationID)
    }

    if state.shouldStartVoiceCapture {
      // Present the overlay directly. Incrementing `voiceCaptureTrigger` would
      // call `openTalkOverlay()`, which would replace the Shortcut launch
      // metadata with an ordinary in-app launch.
      dismissKeyboardIfNeeded()
      isShowingTalkOverlay = true
    }

    if let unavailable = state.unavailableMessage, !state.shouldStartVoiceCapture {
      talkUnavailableMessage = unavailable
      isShowingTalkOverlay = true
    }

    if state.shouldOpenSettings {
      isShowingSettings = true
    }

    if state.selectedTab != previousTab {
      withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
        selectedTab = state.selectedTab
      }
    } else {
      selectedTab = state.selectedTab
    }
  }

  private func selectTab(_ tab: AppShellTab) {
    if tab != .library {
      selectedLibraryAsset = nil
    }
    withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
      selectedTab = tab
    }
  }

  private func startNewChat() {
    onStartNewChat()
    chatDraft = ""
    selectTab(.chat)
  }

  private func openAudienceChat(prompt: String) {
    guard chatEnabled else { return }
    chatDraft = prompt
    selectTab(.chat)
  }

  private func openTalkOverlay() {
    guard chatEnabled else { return }
    dismissKeyboardIfNeeded()
    talkAutoSubmit = FrequentActionInteractionBudget.inAppVoiceSubmit
      .completesOnFinalActivation
    talkUnavailableMessage = nil
    eyesFreeLaunch = nil
    isShowingTalkOverlay = true
  }

  private func openPublicProfile() {
    dismissKeyboardIfNeeded()
    applyOpenPane(.none)
    guard
      let urlString = profile.publicProfileURL,
      let policy = PublicProfileURLPolicy(publicProfileURL: urlString)
        ?? PublicProfileURLPolicy(webBaseURL: webBaseURL),
      let url = policy.validatedURL(from: urlString)
    else { return }
    publicProfileBrowserItem = PublicProfileBrowserDestination(url: url, policy: policy)
  }

  private func openProfileQR() {
    dismissKeyboardIfNeeded()
    applyOpenPane(.none)
    guard profile.qrPayload != nil else { return }
    isShowingProfileQR = true
  }

  private func presentVideoProposal(_ proposal: MobileChatVideoProposalPayload) {
    guard chatEnabled else { return }
    dismissKeyboardIfNeeded()
    teleprompterProposal = proposal
  }

  private func openQuickVlogMode() {
    presentVideoProposal(.quickVlog)
  }

  private func presentEntity(_ item: EntityContextItem) {
    lastEntityContext = item
    entityContext = nil
    applyOpenPane(.rail)
  }

  /// The proposal's script auto-loads into the overlay; saving a recording
  /// dismisses the overlay and lands the user on Library (JOV-5075).
  private func teleprompterViewModel(
    for proposal: MobileChatVideoProposalPayload
  ) -> TeleprompterViewModel {
    let viewModel = TeleprompterViewModel(proposal: proposal)
    if ProcessInfo.processInfo.arguments.contains("-ui-testing-teleprompter") {
      viewModel.contentMode = .prompt
    }
    viewModel.onSaved = { _ in
      self.teleprompterProposal = nil
      self.libraryHome = LibraryLandingPolicy.homeAfterSavingVlog()
      self.selectTab(.library)
    }
    return viewModel
  }

  private func presentEntityFromLibrary(_ asset: LibraryAsset) {
    lastEntityContext = EntityContextItem.fromLibraryAsset(asset)
    entityContext = nil
    videoPlaybackAsset = nil

    if LibraryItemPresentationPolicy.shouldOpenSheet(for: asset) {
      entityContext = lastEntityContext
      if asset.type == .video, asset.localVideoURL != nil {
        videoPlaybackAsset = asset
      }
      return
    }

    selectedLibraryAsset = asset
    applyOpenPane(.none)
  }

  static func resolvedInitialTab(
    initialTab: AppShellTab,
    chatEnabled: Bool
  ) -> AppShellTab {
    resolveShellInitialTab(initialTab, chatEnabled: chatEnabled)
  }

  private var drawerWidth: CGFloat {
    min(320, UIScreen.main.bounds.width * 0.86)
  }

  private var railWidth: CGFloat {
    min(320, UIScreen.main.bounds.width * 0.86)
  }

  private var drawerAnimation: Animation {
    isReduceMotionEnabled ? JovieMotion.subtle : JovieMotion.cinematic
  }

  private var isReduceMotionEnabled: Bool {
    #if DEBUG
      AppShellGesturePolicy.effectiveReduceMotion(
        environmentValue: reduceMotion,
        arguments: ProcessInfo.processInfo.arguments
      )
    #else
      reduceMotion
    #endif
  }

  private var isReduceMotionUITest: Bool {
    #if DEBUG
      ProcessInfo.processInfo.arguments.contains("-ui-testing-reduce-motion")
    #else
      false
    #endif
  }

  private func recordInteractiveRailProgressForUITest(_ offset: CGFloat) {
    #if DEBUG
      guard isReduceMotionUITest, offset != 0 else { return }
      didExposeInteractiveRailProgressForUITest = true
    #endif
  }

  private func drawerOpenOffset(safeAreaLeading: CGFloat) -> CGFloat {
    drawerWidth + safeAreaLeading
  }

  private func contentOffset(openOffset: CGFloat, railOpenOffset: CGFloat) -> CGFloat {
    if isShowingDrawer {
      return max(0, openOffset + drawerDragOffset)
    }
    if isShowingRightRail {
      return min(0, -railOpenOffset + railDragOffset)
    }
    if railDragOffset != 0 {
      return min(0, railDragOffset)
    }
    return max(0, drawerDragOffset)
  }

  private func rightRailOffset(railOpenOffset: CGFloat) -> CGFloat {
    if isShowingRightRail {
      return min(0, railDragOffset)
    }
    return railOpenOffset + min(0, railDragOffset)
  }

  private func applyOpenPane(_ pane: AppShellOpenPane) {
    dismissKeyboardIfNeeded()
    switch pane {
    case .none:
      isShowingDrawer = false
      isShowingRightRail = false
      drawerDragOffset = 0
      railDragOffset = 0
    case .sidebar:
      isShowingRightRail = false
      railDragOffset = 0
      isShowingDrawer = true
      drawerDragOffset = 0
    case .rail:
      isShowingDrawer = false
      drawerDragOffset = 0
      isShowingRightRail = true
      railDragOffset = 0
    }
  }

  private func openDrawer() {
    guard !isShowingDrawer else { return }
    applyOpenPane(.sidebar)
  }

  private func closeDrawer() {
    applyOpenPane(.none)
  }

  private func closeDrawerThenSelect(_ tab: AppShellTab) {
    if tab == .library {
      selectedLibraryAsset = nil
    }
    closeDrawer()
    DispatchQueue.main.asyncAfter(deadline: .now() + JovieMotion.cinematicDuration) {
      selectTab(tab)
    }
  }

  private func dismissKeyboardIfNeeded() {
    guard isKeyboardVisible else { return }
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder),
      to: nil,
      from: nil,
      for: nil
    )
  }

  @ViewBuilder
  private var pagedContent: some View {
    let showsChatUnderlay = appShellShowsChatUnderlay(
      selectedTab: selectedTab,
      chatEnabled: chatEnabled
    )
    let isChatSelected = selectedTab == .chat

    ZStack {
      if showsChatUnderlay {
        chatContent($chatDraft, $voiceCaptureTrigger, presentEntity, presentVideoProposal)
          .opacity(isChatSelected ? 1 : 0)
          .allowsHitTesting(isChatSelected)
          .accessibilityHidden(!isChatSelected)
      }

      if !isChatSelected || !chatEnabled {
        nonChatPagedContent
      }
    }
  }

  @ViewBuilder
  private var nonChatPagedContent: some View {
    switch selectedTab {
    case .chat:
      profileContent
    case .library:
      libraryPagedContent
    case .calendar:
      calendarContent(openAudienceChat)
    case .inbox:
      inboxContent(openAudienceChat)
    case .profile:
      profileContent
    case .audience:
      audienceContent(openAudienceChat)
    }
  }

  @ViewBuilder
  private var libraryPagedContent: some View {
    ZStack {
      libraryContent(presentEntityFromLibrary, $libraryHome)
        .opacity(selectedLibraryAsset == nil ? 1 : 0)
        .allowsHitTesting(selectedLibraryAsset == nil)
        .accessibilityHidden(selectedLibraryAsset != nil)

      if let asset = selectedLibraryAsset {
        LibraryItemScreen(
          asset: asset,
          onBack: {
            selectedLibraryAsset = nil
          },
          onEditInChat: { prompt in
            selectedLibraryAsset = nil
            applyOpenPane(.none)
            chatDraft = prompt
            selectTab(.chat)
          }
        )
        .id(asset.id)
      }
    }
  }

  private var pageTransition: AnyTransition {
    .opacity
  }

  private func followLeadingRailDrag(translationX: CGFloat, openOffset: CGFloat) {
    drawerDragOffset = min(translationX, openOffset)
    railDragOffset = 0
  }

  private func followTrailingRailDrag(translationX: CGFloat) {
    drawerDragOffset = 0
    railDragOffset = max(translationX, -railWidth)
  }

  private func resetRailDragOffsets() {
    drawerDragOffset = 0
    railDragOffset = 0
  }

  private func settleRailDragOffsets() {
    withAnimation(isReduceMotionEnabled ? nil : drawerAnimation) {
      resetRailDragOffsets()
    }
  }

  private func isRailSwipeExcluded(at startLocation: CGPoint) -> Bool {
    guard AppShellGesturePolicy.appliesSubviewExclusion(
      selectedTab: selectedTab,
      isShowingDrawer: isShowingDrawer,
      isShowingRightRail: isShowingRightRail
    ) else { return false }
    return railSwipeExclusionStore.frames.contains(where: { $0.contains(startLocation) })
  }

  /// Chat-home pans open rails (JOV-5201). Other surfaces keep edge drags.
  /// Horizontal pans never page between tabs.
  private func edgeRailGesture(openOffset: CGFloat, containerWidth: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 8, coordinateSpace: .named("app-shell"))
      .updating($isRailGestureActive) { _, isActive, _ in
        isActive = true
      }
      .onChanged { value in
        guard !isRailGestureBlockedForCurrentDrag else {
          resetRailDragOffsets()
          return
        }

        guard AppShellGesturePolicy.allowsEdgeRailDrag(
          reduceMotion: isReduceMotionEnabled,
          isKeyboardVisible: isKeyboardVisible,
          isShowingTalkOverlay: isShowingTalkOverlay,
          hasTeleprompterProposal: teleprompterProposal != nil
        ) else {
          isRailGestureBlockedForCurrentDrag = true
          resetRailDragOffsets()
          return
        }

        guard AppShellGesturePolicy.showsInteractiveRailProgress(
          reduceMotion: isReduceMotionEnabled
        ) else {
          resetRailDragOffsets()
          return
        }

        guard !isRailSwipeExcluded(at: value.startLocation) else {
          isRailGestureBlockedForCurrentDrag = true
          resetRailDragOffsets()
          return
        }

        if isShowingDrawer {
          drawerDragOffset = min(0, value.translation.width)
          railDragOffset = 0
        } else if isShowingRightRail {
          drawerDragOffset = 0
          railDragOffset = max(0, value.translation.width)
        } else if AppShellGesturePolicy.shouldFollowLeadingDrag(
          selectedTab: selectedTab,
          startX: value.startLocation.x,
          translationX: value.translation.width,
          translationY: value.translation.height
        ) {
          followLeadingRailDrag(translationX: value.translation.width, openOffset: openOffset)
        } else if AppShellGesturePolicy.shouldFollowTrailingDrag(
          selectedTab: selectedTab,
          startX: value.startLocation.x,
          containerWidth: containerWidth,
          translationX: value.translation.width,
          translationY: value.translation.height
        ) {
          followTrailingRailDrag(translationX: value.translation.width)
        } else {
          resetRailDragOffsets()
        }
      }
      .onEnded { value in
        defer { isRailGestureBlockedForCurrentDrag = false }

        guard !isRailGestureBlockedForCurrentDrag else {
          settleRailDragOffsets()
          return
        }

        guard AppShellGesturePolicy.allowsEdgeRailDrag(
          reduceMotion: isReduceMotionEnabled,
          isKeyboardVisible: isKeyboardVisible,
          isShowingTalkOverlay: isShowingTalkOverlay,
          hasTeleprompterProposal: teleprompterProposal != nil
        ) else {
          settleRailDragOffsets()
          return
        }

        guard !isRailSwipeExcluded(at: value.startLocation) else {
          settleRailDragOffsets()
          return
        }

        let predicted = value.predictedEndTranslation.width
        if isShowingDrawer {
          if value.translation.width < -AppShellGesturePolicy.openDistance
            || predicted < -AppShellGesturePolicy.openPredicted
          {
            applyOpenPane(AppShellPanePolicy.paneAfterDismiss())
          } else {
            settleRailDragOffsets()
          }
          return
        }

        if isShowingRightRail {
          if AppShellGesturePolicy.isRightEdgeClose(
            isRailOpen: true,
            translationX: value.translation.width,
            predictedX: predicted
          ) {
            applyOpenPane(AppShellPanePolicy.paneAfterDismiss())
          } else {
            settleRailDragOffsets()
          }
          return
        }

        if AppShellGesturePolicy.isLeadingSwipeOpen(
          selectedTab: selectedTab,
          startX: value.startLocation.x,
          translationX: value.translation.width,
          predictedX: predicted,
          translationY: value.translation.height
        ) {
          applyOpenPane(AppShellPanePolicy.paneAfterLeadingSwipe(current: .none))
          return
        }

        if AppShellGesturePolicy.isTrailingSwipeOpen(
          selectedTab: selectedTab,
          startX: value.startLocation.x,
          containerWidth: containerWidth,
          translationX: value.translation.width,
          predictedX: predicted,
          translationY: value.translation.height
        ) {
          applyOpenPane(AppShellPanePolicy.paneAfterTrailingSwipe(current: .none))
          return
        }
        settleRailDragOffsets()
      }
  }

  private var shellToolbar: some View {
    HStack(alignment: .center, spacing: JovieSpacing.medium) {
      Button(action: openDrawer) {
        DashboardAvatarView(
          name: profile.displayName,
          avatarURL: profile.avatarURL
        )
        .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open navigation drawer")
      .accessibilityIdentifier("shell-drawer-open")

      VStack(alignment: .leading, spacing: 2) {
        Text(selectedTab.title)
          .font(JovieFont.display(size: 22))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        if isOffline {
          Text("Offline")
            .font(JovieFont.body(size: 11, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
        }
      }

      Spacer(minLength: 0)

      if chatEnabled {
        Button(action: openQuickVlogMode) {
          Image(systemName: "video")
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Open Vlog Mode")
        .accessibilityHint("Start a private on-device vlog in Prompt Mode")
        .accessibilityIdentifier("shell-vlog-open")

        Button(action: openTalkOverlay) {
          Image(systemName: "mic.fill")
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Talk")
        .accessibilityIdentifier("shell-talk-fab")
        .accessibilityHint("Opens full-screen voice capture")
      }

      Button {
        isShowingSettings = true
      } label: {
        Image(systemName: "gearshape")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Open Settings")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.small)
    .background(JovieColor.backgroundBase.opacity(0.96))
  }
}
