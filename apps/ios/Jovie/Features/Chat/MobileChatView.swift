import SwiftUI

enum MobileChatKeyboardPolicy {
  /// Dismiss when the assistant starts streaming only if the user has not typed since send.
  static func shouldDismissOnStreamingStart(userEditedSinceSend: Bool) -> Bool {
    !userEditedSinceSend
  }
}

struct MobileChatView: View {
  @Bindable var repository: ChatRepository
  @Binding var draft: String
  @Binding var voiceCaptureTrigger: Int
  let webBaseURL: URL

  @FocusState private var isComposerFocused: Bool
  @State private var isAtBottom = true
  @State private var userEditedSinceSend = false
  @State private var voiceCaptureService = VoiceCaptureService()

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
    .accessibilityIdentifier("mobile-chat")
    .task {
      await repository.refreshConversations()
    }
    .task(id: voiceCaptureTrigger) {
      guard voiceCaptureTrigger > 0 else { return }
      await startVoiceCapture()
    }
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
              }
            )
            .transition(.opacity.combined(with: .offset(y: 6)))
          }
        }
        // Keyed on `count` only, so this fires when a message is appended --
        // never on in-place streaming text/status mutations of an existing
        // row, which must render without animation.
        .animation(JovieMotion.easeOut(), value: repository.timeline.count)
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
      .onChange(of: repository.timeline.last?.content) {
        scrollToBottomIfPinned(using: proxy, animated: false)
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
      // Bottom-center, above the composer: the shell-level Talk FAB now owns
      // bottom-trailing (JOV-3670), so this button relocates to avoid overlap.
      .overlay(alignment: .bottom) {
        if !isAtBottom {
          Button {
            isAtBottom = true
            withAnimation(.easeOut(duration: 0.25)) {
              proxy.scrollTo("chat-bottom", anchor: .bottom)
            }
          } label: {
            Image(systemName: "arrow.down")
          }
          .buttonStyle(JovieIconButtonStyle())
          .padding(.bottom, JovieSpacing.medium)
          .transition(.opacity.combined(with: .scale(scale: 0.85)))
          .animation(.spring(duration: 0.2), value: isAtBottom)
          .accessibilityLabel("Scroll to latest message")
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
        voiceCaptureService: voiceCaptureService,
        onSend: {
          let text = draft
          draft = ""
          userEditedSinceSend = false
          Task { await repository.send(text: text) }
        },
        onSelectWorkflow: { action in
          draft = action.prompt
          userEditedSinceSend = true
        },
        onDraftEdited: {
          userEditedSinceSend = true
        },
        onVoiceStart: {
          await startVoiceCapture()
        },
        onVoiceFinish: {
          await finishVoiceCapture()
        },
        onVoiceCancel: {
          voiceCaptureService.cancel()
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
    guard isAtBottom else { return }
    if animated {
      withAnimation(.easeOut(duration: 0.25)) {
        proxy.scrollTo("chat-bottom", anchor: .bottom)
      }
    } else {
      proxy.scrollTo("chat-bottom", anchor: .bottom)
    }
  }

  private var emptyState: some View {
    VStack(spacing: JovieSpacing.large) {
      Spacer(minLength: 120)

      VStack(spacing: JovieSpacing.large) {
        JovieLogoMark(size: 34)

        VStack(spacing: JovieSpacing.small) {
          Text("Ask Jovie")
            .font(JovieFont.display(size: 28))
            .foregroundStyle(JovieColor.textPrimary)
            .multilineTextAlignment(.center)

          Text(
            repository.isOffline
              ? "Offline. Drafts stay on this device and cached history remains available."
              : "Ask Jovie about your profile, releases, and next moves."
          )
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textTertiary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: 330)
      .padding(.horizontal, JovieSpacing.xLarge)

      Spacer(minLength: 48)
    }
  }

  private func startVoiceCapture() async {
    guard !repository.isSending else { return }
    isComposerFocused = false
    do {
      try await voiceCaptureService.start()
    } catch {
      voiceCaptureService.cancel()
    }
  }

  private func finishVoiceCapture() async {
    do {
      let result = try await voiceCaptureService.finish()
      userEditedSinceSend = false
      draft = ""
      await repository.send(text: result.transcript)
    } catch {
      voiceCaptureService.cancel()
    }
  }
}

private struct MobileChatMessageRow: View {
  let item: MobileChatTimelineItem
  let webBaseURL: URL
  let onRetry: () -> Void
  let onSubmitPrompt: (String) -> Void

  private var isStreamingAssistant: Bool {
    item.role == .assistant && item.status == .streaming
  }

  private var assistantSegments: [MobileChatRenderableSegment] {
    MobileChatContentParser.segments(from: item.content, isStreaming: isStreamingAssistant)
  }

  private var assistantDisplayText: String {
    MobileChatContentParser.displayText(from: item.content, isStreaming: isStreamingAssistant)
  }

  var body: some View {
    VStack(alignment: item.role == .user ? .trailing : .leading, spacing: JovieSpacing.small) {
      if item.role == .user {
        userMessageBubble
      } else {
        assistantMessageContent
      }

      if item.requiresWebHandoff, let handoffURL = item.handoffURL {
        Link("Continue on web", destination: handoffURL)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
      }

      if item.status == .failed {
        Button("Retry", action: onRetry)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
      }
    }
    .frame(maxWidth: .infinity, alignment: item.role == .user ? .trailing : .leading)
  }

  private var userMessageBubble: some View {
    MobileChatProseText(
      runs: MobileChatProseTokenizer.tokenize(item.content, isStreaming: false),
      tone: .onLight
    )
    .font(JovieFont.body(size: 16))
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.medium)
    .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .frame(maxWidth: 320, alignment: .trailing)
  }

  @ViewBuilder
  private var assistantMessageContent: some View {
    let segments = assistantSegments
    let displayText = assistantDisplayText
    let hasRenderableSegments = segments.contains { segment in
      switch segment {
      case .text, .toolCall, .merchArtifact:
        return true
      }
    }
    let showsThinking = displayText.isEmpty && !hasRenderableSegments && isStreamingAssistant

    if showsThinking {
      // Same padding/background/corner-radius/frame as the assistant prose
      // bubble below -- only the inner content (dots vs. text) differs, so
      // swapping this bubble out for real content is a normal content-size
      // change, not a layout-shift bug.
      MobileChatThinkingDotsView()
        .padding(.horizontal, JovieSpacing.large)
        .padding(.vertical, JovieSpacing.medium)
        .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .frame(maxWidth: 320, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: JovieSpacing.small) {
        let proseRuns = assistantProseRuns(from: segments)
        if !proseRuns.isEmpty {
          MobileChatProseText(runs: proseRuns, tone: .onDark)
            .font(JovieFont.body(size: 16))
            .padding(.horizontal, JovieSpacing.large)
            .padding(.vertical, JovieSpacing.medium)
            .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .frame(maxWidth: 320, alignment: .leading)
        }

        ForEach(segments) { segment in
          switch segment {
          case let .toolCall(model):
            MobileChatToolCardView(model: model)
              .frame(maxWidth: 320, alignment: .leading)
          case let .merchArtifact(artifact):
            MobileChatMerchOptionsView(artifact: artifact, onSelectPrompt: onSubmitPrompt)
              .frame(maxWidth: .infinity, alignment: .leading)
          case .text:
            EmptyView()
          }
        }
      }
    }
  }

  /// Flattens every `.text` segment's prose runs into one ordered run list,
  /// joined by a blank-line run wherever segments were separated (mirrors
  /// the `\n\n` join in `MobileChatContentParser.displayText`). Tool-call
  /// segments render as their own cards below and are excluded here.
  private func assistantProseRuns(from segments: [MobileChatRenderableSegment]) -> [MobileChatProseRun] {
    var runs: [MobileChatProseRun] = []
    for segment in segments {
      guard case let .text(segmentRuns) = segment, !segmentRuns.isEmpty else { continue }
      if !runs.isEmpty {
        runs.append(.text("\n\n"))
      }
      runs.append(contentsOf: segmentRuns)
    }
    return runs
  }
}

/// Three-dot streaming indicator that replaces the old "Thinking…" text.
/// Dots pulse in sequence (staggered `.delay`) via `repeatForever`; under
/// Reduce Motion they render static (no movement/opacity animation) per
/// `.claude/rules/motion.md` §6. The row height is pinned to match a 16pt
/// body line so it reserves the same footprint the text bubble used.
private struct MobileChatThinkingDotsView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var isPulsing = false

  private static let dotSize: CGFloat = 6
  private static let dotSpacing: CGFloat = 4
  private static let rowHeight: CGFloat = 20

  var body: some View {
    HStack(spacing: Self.dotSpacing) {
      ForEach(0..<3, id: \.self) { index in
        Circle()
          .fill(JovieColor.textTertiary)
          .frame(width: Self.dotSize, height: Self.dotSize)
          .opacity(dotOpacity)
          .animation(dotAnimation(delayIndex: index), value: isPulsing)
      }
    }
    .frame(height: Self.rowHeight, alignment: .center)
    .onAppear {
      guard !reduceMotion else { return }
      isPulsing = true
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Thinking")
  }

  private var dotOpacity: Double {
    guard !reduceMotion else { return 0.6 }
    return isPulsing ? 1 : 0.3
  }

  private func dotAnimation(delayIndex: Int) -> Animation? {
    guard !reduceMotion else { return nil }
    // Constant/ambient motion uses `linear` per motion.md §3, not an
    // eased token -- durations still come from JovieMotion so nothing here
    // is a raw hardcoded ms value.
    return Animation.linear(duration: JovieMotion.slowDuration)
      .repeatForever(autoreverses: true)
      .delay(JovieMotion.subtleDuration * Double(delayIndex))
  }
}

private struct ChatComposerView: View {
  @Binding var draft: String
  @FocusState.Binding var isComposerFocused: Bool
  let isSending: Bool
  let isOffline: Bool
  @Bindable var voiceCaptureService: VoiceCaptureService
  let onSend: () -> Void
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void
  let onDraftEdited: () -> Void
  let onVoiceStart: () async -> Void
  let onVoiceFinish: () async -> Void
  let onVoiceCancel: () -> Void

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      isFocused: $isComposerFocused,
      placeholder: isOffline ? "Ask Jovie (offline)" : "Ask Jovie",
      isSending: isSending,
      isPlusEnabled: !isSending,
      voiceCaptureService: voiceCaptureService,
      onVoiceStart: onVoiceStart,
      onVoiceFinish: onVoiceFinish,
      onVoiceCancel: onVoiceCancel,
      onSend: onSend,
      onSelectWorkflow: onSelectWorkflow,
      onDraftEdited: onDraftEdited
    )
  }
}

/// Surface a `MobileChatProseText` renders on. Drives chip color mixing so
/// an entity/skill chip stays legible on whichever bubble background it
/// lands on -- mirrors `EntityChipTone` (`onLight` | `onDark`) on the web.
enum MobileChatProseTone {
  /// White user-message bubble (`userMessageBubble`).
  case onLight
  /// Dark assistant-transcript bubble (`assistantMessageContent`).
  case onDark
}

// MARK: - Inline prose flow (GH-12708 entity chip thumbnails v2)

enum MobileChatFlowToken: Hashable {
  case textWord(String)
  case entity(kind: MobileChatEntityKind, id: String, label: String)
  case skill(id: String, label: String)
}

/// Word-wrap layout for inline transcript prose. Mixes plain `Text` words with
/// entity pill chips and skill labels without shredding sentence flow.
private struct MobileChatInlineFlowLayout: Layout {
  var horizontalSpacing: CGFloat = 0
  var verticalSpacing: CGFloat = 2

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard !subviews.isEmpty else { return .zero }

    let maxWidth = proposal.width ?? .greatestFiniteMagnitude
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var maxLineWidth: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > maxWidth {
        maxLineWidth = max(maxLineWidth, x - horizontalSpacing)
        x = 0
        y += rowHeight + verticalSpacing
        rowHeight = 0
      }
      rowHeight = max(rowHeight, size.height)
      x += size.width + horizontalSpacing
    }

    maxLineWidth = max(maxLineWidth, x > 0 ? x - horizontalSpacing : 0)
    return CGSize(width: maxLineWidth, height: y + rowHeight)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    guard !subviews.isEmpty else { return }

    let maxWidth = bounds.width
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.minX + maxWidth {
        x = bounds.minX
        y += rowHeight + verticalSpacing
        rowHeight = 0
      }
      subview.place(
        at: CGPoint(x: x, y: y + (rowHeight - size.height) / 2),
        anchor: .topLeading,
        proposal: ProposedViewSize(width: size.width, height: size.height)
      )
      rowHeight = max(rowHeight, size.height)
      x += size.width + horizontalSpacing
    }
  }
}

/// Transcript-variant entity chip with a fixed 16×16 thumbnail/dot slot and
/// cached remote artwork (no raw `AsyncImage`). Mirrors web
/// `.system-b-entity-chip[data-entity-variant="transcript"]`.
private struct MobileChatEntityChipView: View {
  let kind: MobileChatEntityKind
  let id: String
  let label: String
  let tone: MobileChatProseTone

  private static let mediaSize: CGFloat = 16
  private static let maxChipWidth: CGFloat = 220

  var body: some View {
    HStack(spacing: 6) {
      mediaSlot
      Text(label)
        .lineLimit(1)
        .truncationMode(.tail)
    }
    .font(JovieFont.body(size: 16))
    .foregroundStyle(chipTextColor)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .frame(maxWidth: Self.maxChipWidth)
    .background(chipBackground, in: Capsule())
    .overlay(
      Capsule().stroke(chipBorderColor, lineWidth: 1)
    )
    .accessibilityLabel("\(kindPrefix): \(label)")
  }

  @ViewBuilder
  private var mediaSlot: some View {
    let thumbnailURL = MobileChatEntityThumbnailResolver.thumbnailURL(kind: kind, id: id)
    CachedRemoteImageView(imageURL: thumbnailURL, size: Self.mediaSize) {
      accentDot
    }
    .frame(width: Self.mediaSize, height: Self.mediaSize)
    .accessibilityHidden(true)
  }

  private var accentDot: some View {
    ZStack {
      Circle()
        .fill(accentColor.opacity(0.18))
      Circle()
        .fill(accentColor)
        .padding(4)
    }
  }

  private var accentColor: Color {
    JovieColor.EntityAccent.color(for: kind)
  }

  private var kindPrefix: String {
    switch kind {
    case .release: return "Release"
    case .artist: return "Artist"
    case .track: return "Track"
    case .event: return "Event"
    }
  }

  // Converged onto the web "input variant" chip recipe
  // (apps/web/styles/design-system.css .system-b-entity-chip): border at
  // accent-30%, background at accent-13% for both tones. Text stays
  // accent-tinted on the dark assistant bubble (legible at full accent
  // brightness against `surface1`); the light user bubble keeps a
  // near-black text color since these saturated accents read too low-
  // contrast on white to serve as body text there.
  private var chipTextColor: Color {
    switch tone {
    case .onDark:
      return accentColor
    case .onLight:
      return JovieColor.backgroundBase
    }
  }

  private var chipBackground: Color {
    accentColor.opacity(0.13)
  }

  private var chipBorderColor: Color {
    accentColor.opacity(0.30)
  }
}

/// Renders an ordered `[MobileChatProseRun]` inline within a chat bubble.
/// Entity mentions use transcript pill chips with cached thumbnails (GH-12708);
/// skill invocations stay text-only; plain text wraps word-by-word.
struct MobileChatProseText: View {
  let runs: [MobileChatProseRun]
  let tone: MobileChatProseTone

  var body: some View {
    let tokens = Self.flowTokens(from: runs)
    MobileChatInlineFlowLayout(horizontalSpacing: 0, verticalSpacing: 2) {
      ForEach(Array(tokens.enumerated()), id: \.offset) { _, token in
        flowSubview(for: token)
      }
    }
  }

  @ViewBuilder
  private func flowSubview(for token: MobileChatFlowToken) -> some View {
    switch token {
    case let .textWord(value):
      Text(verbatim: value)
        .foregroundStyle(primaryTextColor)
    case let .entity(kind, id, label):
      MobileChatEntityChipView(kind: kind, id: id, label: label, tone: tone)
    case let .skill(_, label):
      Text(label)
        .foregroundStyle(skillLabelColor)
        .fontWeight(.medium)
    }
  }

  private var primaryTextColor: Color {
    switch tone {
    case .onDark:
      return JovieColor.textPrimary
    case .onLight:
      return JovieColor.backgroundBase
    }
  }

  private var skillLabelColor: Color {
    switch tone {
    case .onDark:
      return JovieColor.textSecondary
    case .onLight:
      return JovieColor.backgroundBase.opacity(0.72)
    }
  }

  static func flowTokens(from runs: [MobileChatProseRun]) -> [MobileChatFlowToken] {
    runs.flatMap { run -> [MobileChatFlowToken] in
      switch run {
      case let .text(value):
        return splitTextIntoFlowTokens(value)
      case let .entity(kind, id, label):
        return [.entity(kind: kind, id: id, label: label)]
      case let .skill(id, label):
        return [.skill(id: id, label: label)]
      }
    }
  }

  private static func splitTextIntoFlowTokens(_ text: String) -> [MobileChatFlowToken] {
    guard !text.isEmpty else { return [] }

    var tokens: [MobileChatFlowToken] = []
    var current = ""

    for character in text {
      if character.isWhitespace {
        if !current.isEmpty {
          tokens.append(.textWord(current))
          current = ""
        }
        tokens.append(.textWord(String(character)))
      } else {
        current.append(character)
      }
    }

    if !current.isEmpty {
      tokens.append(.textWord(current))
    }

    return tokens
  }
}
