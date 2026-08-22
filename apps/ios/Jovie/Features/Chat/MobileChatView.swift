import SwiftUI

enum ChatEmptyGreeting: String, CaseIterable, Sendable {
  case letsGetIt = "Let's get it"
  case readyToStart = "Ready to start?"
  case readyWhenYouAre = "Ready when you are"

  static let lockedCopy = allCases.map(\.rawValue)

  /// Day-stable rotate. Product shows one of the three; the still is Let's get it.
  static func current(at date: Date = .now, calendar: Calendar = .current) -> String {
    let day = calendar.ordinality(of: .day, in: .era, for: date) ?? 0
    return lockedCopy[day % lockedCopy.count]
  }

  static func isLocked(_ copy: String) -> Bool {
    lockedCopy.contains(copy)
  }
}

enum MobileChatEmptyHomePolicy {
  enum GreetingPlacement: Equatable {
    /// Vertically centered in the remaining space above the docked composer.
    case centeredAboveDockedComposer
  }

  static func greetingPlacement() -> GreetingPlacement {
    .centeredAboveDockedComposer
  }

  static func composerIsDockedToBottom() -> Bool {
    true
  }

  static func showsBrandMark() -> Bool {
    false
  }

  static func showsFeatureIntroOnEmptyHome() -> Bool {
    false
  }
}

struct MobileChatEmptyGreetingView: View {
  let greeting: String

  var body: some View {
    Text(greeting)
      .font(
        JovieFont.display(
          size: JovieFont.emptyGreetingSize,
          numericWeight: JovieFont.emptyGreetingWeight
        )
      )
      .foregroundStyle(JovieColor.textPrimary)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .frame(minHeight: 40)
      .accessibilityAddTraits(.isHeader)
      .accessibilityIdentifier("chat-empty-greeting")
  }
}

enum MobileChatKeyboardPolicy {
  /// Dismiss when the assistant starts streaming only if the user has not typed since send.
  static func shouldDismissOnStreamingStart(userEditedSinceSend: Bool) -> Bool {
    !userEditedSinceSend
  }

  static func shouldDismissOnDownwardDrag(translationHeight: CGFloat) -> Bool {
    translationHeight > 40
  }
}

enum MobileChatScrollPolicy {
  /// Auto-stick to the latest message only while the user is still pinned.
  static func shouldAutoScrollToLatest(isAtBottom: Bool) -> Bool {
    isAtBottom
  }

  /// Jump control appears only after the user has scrolled away from latest.
  static func shouldShowJumpToLatest(isAtBottom: Bool) -> Bool {
    !isAtBottom
  }
}

/// Chat transcript motion is fade-only. Offset/scale hitch the list (JOV-5201).
enum MobileChatTranscriptMotion {
  static func rowInsertion(reduceMotion: Bool) -> Animation? {
    reduceMotion ? nil : JovieMotion.easeOut()
  }

  static func jumpToLatest(reduceMotion: Bool) -> Animation? {
    reduceMotion ? nil : JovieMotion.easeOut(duration: JovieMotion.slowDuration)
  }

  static func scrollToLatest(reduceMotion: Bool) -> Animation? {
    jumpToLatest(reduceMotion: reduceMotion)
  }
}

struct MobileChatView: View {
  @Bindable var repository: ChatRepository
  @Binding var draft: String
  @Binding var voiceCaptureTrigger: Int
  let webBaseURL: URL
  let onEntityTap: (EntityContextItem) -> Void
  let onRecordVideo: (MobileChatVideoProposalPayload) -> Void

  @FocusState private var isComposerFocused: Bool
  @State private var isAtBottom = true
  @State private var userEditedSinceSend = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(
    repository: ChatRepository,
    draft: Binding<String>,
    voiceCaptureTrigger: Binding<Int>,
    webBaseURL: URL,
    onEntityTap: @escaping (EntityContextItem) -> Void = { _ in },
    onRecordVideo: @escaping (MobileChatVideoProposalPayload) -> Void = { _ in }
  ) {
    self.repository = repository
    _draft = draft
    _voiceCaptureTrigger = voiceCaptureTrigger
    self.webBaseURL = webBaseURL
    self.onEntityTap = onEntityTap
    self.onRecordVideo = onRecordVideo
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      Group {
        if repository.timeline.isEmpty {
          emptyState
        } else {
          transcriptView
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        composerChrome
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("mobile-chat")
    .contentShape(Rectangle())
    .onTapGesture {
      isComposerFocused = false
    }
    .simultaneousGesture(
      DragGesture(minimumDistance: 24)
        .onChanged { value in
          guard MobileChatKeyboardPolicy.shouldDismissOnDownwardDrag(
            translationHeight: value.translation.height
          ) else { return }
          isComposerFocused = false
        }
    )
    .toolbar {
      ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button("Done") {
          isComposerFocused = false
        }
        .accessibilityIdentifier("chat-keyboard-done")
      }
    }
    .task {
      await repository.refreshConversations()
    }
    // voiceCaptureTrigger is owned by the shell Talk FAB / App Intents path
    // (JOV-3636). Chat no longer starts capture itself — the shell opens
    // TalkOverlayView when the trigger increments.
  }

  @ViewBuilder
  private var transcriptView: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: JovieSpacing.large) {
          ForEach(repository.timeline) { item in
            MobileChatMessageRow(
              item: item,
              webBaseURL: webBaseURL,
              onRetry: {
                guard let clientTurnId = item.clientTurnId else { return }
                Task { await repository.retry(clientTurnId: clientTurnId) }
              },
              onSubmitPrompt: { prompt in
                Task { await repository.send(text: prompt) }
              },
              onEntityTap: onEntityTap,
              onRecordVideo: onRecordVideo
            )
            .transition(.opacity)
          }
        }
        // Keyed on `count` only, so this fires when a message is appended --
        // never on in-place streaming text/status mutations of an existing
        // row, which must render without animation.
        .animation(
          MobileChatTranscriptMotion.rowInsertion(reduceMotion: reduceMotion),
          value: repository.timeline.count
        )
        .padding(.horizontal, JovieSpacing.large)
        .padding(.top, JovieSpacing.xLarge)
        .padding(.bottom, JovieSpacing.medium)

        // ponytail: onAppear/onDisappear of this sentinel tracks whether the user is near
        // the bottom without needing coordinate-space math
        Color.clear
          .frame(height: 1)
          .id("chat-bottom")
          .onAppear { isAtBottom = true }
          .onDisappear { isAtBottom = false }
      }
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .contentShape(Rectangle())
      .simultaneousGesture(
        TapGesture().onEnded {
          isComposerFocused = false
        }
      )
      .onChange(of: repository.timeline.count) {
        scrollToBottomIfPinned(using: proxy, animated: true)
      }
      .onChange(of: repository.timeline.last?.status) {
        guard repository.timeline.last?.status == .streaming else { return }
        guard MobileChatKeyboardPolicy.shouldDismissOnStreamingStart(
          userEditedSinceSend: userEditedSinceSend
        ) else { return }
        isComposerFocused = false
      }
      .onChange(of: isComposerFocused) {
        scrollToBottomIfPinned(using: proxy, animated: true)
      }
      .overlay(alignment: .bottom) {
        if MobileChatScrollPolicy.shouldShowJumpToLatest(isAtBottom: isAtBottom) {
          Button {
            isAtBottom = true
            scrollToBottomIfPinned(using: proxy, animated: true)
          } label: {
            Image(systemName: "arrow.down")
          }
          .buttonStyle(JovieIconButtonStyle())
          .padding(.bottom, JovieSpacing.medium)
          .transition(.opacity)
          .animation(
            MobileChatTranscriptMotion.jumpToLatest(reduceMotion: reduceMotion),
            value: isAtBottom
          )
          .accessibilityLabel("Scroll to latest message")
          .accessibilityIdentifier("chat-scroll-to-latest")
        }
      }
    }
  }

  private var composerChrome: some View {
    VStack(spacing: 0) {
      if let errorMessage = repository.lastErrorMessage, repository.isOffline {
        Text(errorMessage)
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
          .multilineTextAlignment(.center)
          .padding(.horizontal, JovieSpacing.large)
          .padding(.bottom, JovieSpacing.small)
      }

      ChatComposerView(
        draft: $draft,
        isComposerFocused: $isComposerFocused,
        isSending: repository.isSending,
        isOffline: repository.isOffline,
        workspaceMode: repository.workspace,
        onSend: {
          let text = draft
          draft = ""
          userEditedSinceSend = false
          isComposerFocused = false
          Task { await repository.send(text: text) }
        },
        onMic: {
          isComposerFocused = false
          voiceCaptureTrigger += 1
        },
        onSelectWorkflow: { action in
          draft = action.prompt
          userEditedSinceSend = true
        },
        onDraftEdited: {
          userEditedSinceSend = true
        }
      )
      .padding(.horizontal, JovieSpacing.large)
      .padding(.bottom, JovieSpacing.medium)
    }
    .background(JovieColor.backgroundBase)
  }

  private func scrollToBottomIfPinned(
    using proxy: ScrollViewProxy,
    animated: Bool
  ) {
    guard MobileChatScrollPolicy.shouldAutoScrollToLatest(isAtBottom: isAtBottom) else { return }
    if animated, let animation = MobileChatTranscriptMotion.scrollToLatest(
      reduceMotion: reduceMotion
    ) {
      withAnimation(animation) {
        proxy.scrollTo("chat-bottom", anchor: .bottom)
      }
    } else {
      proxy.scrollTo("chat-bottom", anchor: .bottom)
    }
  }

  private var emptyState: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      VStack(spacing: JovieSpacing.small) {
        MobileChatEmptyGreetingView(greeting: ChatEmptyGreeting.current())
        if repository.workspace == .ovie {
          Text(
            repository.isOffline
              ? "Offline. Drafts stay on this device and cached history remains available."
              : repository.workspace.emptyChatSubtitle
          )
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textTertiary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.horizontal, JovieSpacing.xLarge)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .contentShape(Rectangle())
    .onTapGesture {
      isComposerFocused = false
    }
  }

}
