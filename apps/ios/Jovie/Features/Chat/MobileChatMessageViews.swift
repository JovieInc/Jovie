import SwiftUI
import UIKit

struct MobileChatMessageRow: View {
  let item: MobileChatTimelineItem
  let webBaseURL: URL
  let onRetry: () -> Void
  let onSubmitPrompt: (String) -> Void
  let onEntityTap: (EntityContextItem) -> Void
  var onRecordVideo: (MobileChatVideoProposalPayload) -> Void = { _ in }

  private var isStreamingAssistant: Bool {
    item.role == .assistant && item.status.isInFlight
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

      if item.status == .failed || item.status == .canceled {
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
      tone: .onLight,
      onEntityTap: onEntityTap
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
      case .text, .toolCall, .merchArtifact, .videoProposal:
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
          MobileChatProseText(runs: proseRuns, tone: .onDark, onEntityTap: onEntityTap)
            .font(JovieFont.body(size: 16))
            .padding(.horizontal, JovieSpacing.large)
            .padding(.vertical, JovieSpacing.medium)
            .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .frame(maxWidth: 320, alignment: .leading)
            .contextMenu {
              Button("Copy") {
                UIPasteboard.general.string = item.content
              }
              Button("Share") {
                // Share sheet is host-level; copy keeps this menu discoverable.
                UIPasteboard.general.string = item.content
              }
            }
        }

        ForEach(segments) { segment in
          switch segment {
          case let .toolCall(model):
            MobileChatToolCardView(model: model)
              .frame(maxWidth: 320, alignment: .leading)
          case let .merchArtifact(artifact):
            MobileChatMerchOptionsView(artifact: artifact, onSelectPrompt: onSubmitPrompt)
              .frame(maxWidth: .infinity, alignment: .leading)
          case let .videoProposal(payload):
            TeleprompterProposalCardView(payload: payload, onRecord: onRecordVideo)
              .frame(maxWidth: 320, alignment: .leading)
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

struct ChatComposerView: View {
  @Binding var draft: String
  @FocusState.Binding var isComposerFocused: Bool
  let isSending: Bool
  let isOffline: Bool
  var workspaceMode: MobileWorkspaceMode = .jovie
  let onSend: () -> Void
  var onMic: () -> Void = {}
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void
  let onDraftEdited: () -> Void

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      isFocused: $isComposerFocused,
      placeholder: composerPlaceholder,
      isSending: isSending,
      isPlusEnabled: workspaceMode == .jovie && ChatComposerMetrics.isPlusEnabled(isSending: isSending),
      onSend: onSend,
      onMic: onMic,
      onSelectWorkflow: onSelectWorkflow,
      onDraftEdited: onDraftEdited
    )
    .accessibilityValue(isOffline ? "Offline" : "")
  }

  private var composerPlaceholder: String {
    workspaceMode == .ovie
      ? (isOffline ? workspaceMode.composerOfflinePlaceholder : workspaceMode.askChatLabel)
      : ChatComposerCopy.emptyPlaceholder
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

/// Mixes wrapping `Text` runs with entity chips. Used only when a chip must
/// break the attributed string; plain prose uses one `Text` so wrapping
/// stays a single Messages-style flow (JOV-5204).
private struct MobileChatInlineFlowLayout: Layout {
  var horizontalSpacing: CGFloat = 0
  var verticalSpacing: CGFloat = 2

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    arrange(proposal: proposal, subviews: subviews).size
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let frames = arrange(
      proposal: ProposedViewSize(width: bounds.width, height: bounds.height),
      subviews: subviews
    ).frames
    for (index, subview) in subviews.enumerated() {
      let frame = frames[index]
      subview.place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        anchor: .topLeading,
        proposal: ProposedViewSize(width: frame.width, height: frame.height)
      )
    }
  }

  private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (
    size: CGSize,
    frames: [CGRect]
  ) {
    guard !subviews.isEmpty else { return (.zero, []) }

    let maxWidth = proposal.width ?? .greatestFiniteMagnitude
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var maxLineWidth: CGFloat = 0
    var rowStart = 0
    var frames = Array(repeating: CGRect.zero, count: subviews.count)

    func flushRow(upTo end: Int) {
      guard rowStart < end else { return }
      for index in rowStart..<end {
        let frame = frames[index]
        frames[index] = CGRect(
          x: frame.minX,
          y: y + (rowHeight - frame.height) / 2,
          width: frame.width,
          height: frame.height
        )
      }
      maxLineWidth = max(maxLineWidth, x > 0 ? x - horizontalSpacing : 0)
    }

    for (index, subview) in subviews.enumerated() {
      let unconstrained = subview.sizeThatFits(.unspecified)
      let remaining = max(maxWidth - x, 0)
      let needsWrap = x > 0 && unconstrained.width > remaining
      if needsWrap {
        flushRow(upTo: index)
        x = 0
        y += rowHeight + verticalSpacing
        rowHeight = 0
        rowStart = index
      }

      let available = x == 0 ? maxWidth : max(maxWidth - x, 0)
      let size: CGSize
      if unconstrained.width <= available {
        size = unconstrained
      } else {
        size = subview.sizeThatFits(ProposedViewSize(width: available, height: nil))
      }

      frames[index] = CGRect(x: x, y: 0, width: size.width, height: size.height)
      rowHeight = max(rowHeight, size.height)
      x += size.width + horizontalSpacing
    }

    flushRow(upTo: subviews.count)
    return (CGSize(width: maxLineWidth, height: y + rowHeight), frames)
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
  let onTap: (EntityContextItem) -> Void

  private static let mediaSize: CGFloat = 16
  private static let maxChipWidth: CGFloat = 220

  private var entityItem: EntityContextItem {
    EntityContextItem(kind: kind, entityID: id, label: label)
  }

  var body: some View {
    Button {
      onTap(entityItem)
    } label: {
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
    }
    .buttonStyle(.plain)
    .contextMenu {
      // Long-press peek (JOV-3635): quick open into the entity sheet.
      Button("Open") { onTap(entityItem) }
      Button("Copy Label") { UIPasteboard.general.string = label }
    }
    .accessibilityLabel("\(kindPrefix): \(label)")
    .accessibilityHint("Opens entity context")
    .accessibilityIdentifier("entity-chip-\(kind.rawValue)-\(id)")
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

/// Compact skill pill matching web `.system-b-transcript-skill-chip`
/// (dot + truncated label, 220pt max). One layout subview so the inline
/// flow wraps the whole chip, not the words inside the label.
private struct MobileChatSkillChipView: View {
  let id: String
  let label: String
  let tone: MobileChatProseTone

  private static let maxChipWidth: CGFloat = 220
  private static let dotSize: CGFloat = 6

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(dotColor)
        .frame(width: Self.dotSize, height: Self.dotSize)
        .accessibilityHidden(true)
      Text(label)
        .lineLimit(1)
        .truncationMode(.tail)
    }
    .font(JovieFont.body(size: 12, weight: .medium))
    .foregroundStyle(textColor)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .frame(maxWidth: Self.maxChipWidth)
    .background(chipBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .stroke(chipBorder, lineWidth: 1)
    )
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Skill: \(label)")
    .accessibilityIdentifier("skill-chip-\(id)")
  }

  private var textColor: Color {
    switch tone {
    case .onDark:
      return JovieColor.textPrimary
    case .onLight:
      return JovieColor.backgroundBase
    }
  }

  private var chipBackground: Color {
    switch tone {
    case .onDark:
      return Color.white.opacity(0.035)
    case .onLight:
      return Color.black.opacity(0.055)
    }
  }

  private var chipBorder: Color {
    switch tone {
    case .onDark:
      return Color.white.opacity(0.085)
    case .onLight:
      return Color.black.opacity(0.10)
    }
  }

  private var dotColor: Color {
    switch tone {
    case .onDark:
      return JovieColor.textTertiary
    case .onLight:
      return Color.black.opacity(0.45)
    }
  }
}

/// Renders an ordered `[MobileChatProseRun]` inline within a chat bubble.
/// Entity mentions use transcript pill chips with cached thumbnails (GH-12708);
/// skill invocations stay text-only; plain text is one wrap flow (JOV-5204).
struct MobileChatProseText: View {
  let runs: [MobileChatProseRun]
  let tone: MobileChatProseTone
  var onEntityTap: (EntityContextItem) -> Void = { _ in }

  var body: some View {
    let tokens = Self.flowTokens(from: runs)
    if tokens.contains(where: \.isEntityChip) {
      MobileChatInlineFlowLayout(horizontalSpacing: 0, verticalSpacing: 2) {
        ForEach(Array(tokens.enumerated()), id: \.offset) { _, token in
          flowSubview(for: token)
        }
      }
    } else {
      let attributed = Self.attributedText(from: tokens)
      ViewThatFits(in: .horizontal) {
        Text(attributed)
          .foregroundStyle(primaryTextColor)
          .fixedSize()
        Text(attributed)
          .foregroundStyle(primaryTextColor)
      }
    }
  }

  @ViewBuilder
  private func flowSubview(for token: MobileChatFlowToken) -> some View {
    switch token {
    case let .text(value):
      Text(verbatim: value)
        .foregroundStyle(primaryTextColor)
    case let .entity(kind, id, label):
      MobileChatEntityChipView(
        kind: kind,
        id: id,
        label: label,
        tone: tone,
        onTap: onEntityTap
      )
    case let .skill(id, label):
      MobileChatSkillChipView(id: id, label: label, tone: tone)
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

  static func flowTokens(from runs: [MobileChatProseRun]) -> [MobileChatFlowToken] {
    MobileChatBubbleText.wrapUnits(from: runs)
  }

  static func attributedText(from tokens: [MobileChatFlowToken]) -> AttributedString {
    MobileChatBubbleText.attributedText(from: tokens)
  }
}
