import SwiftUI

enum ChatComposerCopy {
  /// Visible placeholder is deleted (JOV-5319). Accessibility name stays.
  static let emptyPlaceholder = ""
  static let inputAccessibilityLabel = "Chat message"
  static let inputAccessibilityIdentifier = "chat-composer-input"
}

enum ChatComposerMetrics {
  static let barHeight: CGFloat = 52
  static let sendSlotSize = JovieActionButtonMetrics.height
  static let plusButtonSize = JovieActionButtonMetrics.height

  static func isPlusEnabled(isSending: Bool) -> Bool {
    !isSending
  }

  static func isSendEnabled(trimmedDraft: String, isSending: Bool) -> Bool {
    !trimmedDraft.isEmpty && !isSending
  }
}

enum ChatComposerTrailingAction: Equatable {
  case mic
  case send

  static func action(draftIsEmpty: Bool) -> Self {
    draftIsEmpty ? .mic : .send
  }

  var accessibilityIdentifier: String {
    switch self {
    case .mic: return "chat-composer-mic"
    case .send: return "chat-composer-send"
    }
  }

  var accessibilityLabel: String {
    switch self {
    case .mic: return "Talk"
    case .send: return "Send"
    }
  }
}

struct ChatComposerBar: View {
  @Binding var draft: String
  @FocusState.Binding var isFocused: Bool
  let placeholder: String
  let isSending: Bool
  let isPlusEnabled: Bool
  let onSend: () -> Void
  var onMic: () -> Void = {}
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void
  let onDraftEdited: () -> Void

  @State private var isShowingWorkflowSheet = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let trailing = ChatComposerTrailingAction.action(draftIsEmpty: trimmedDraft.isEmpty)
    let slashQuery = ComposerSlashPalette.query(from: draft)
    let slashItems = slashQuery.map {
      ComposerSlashPalette.items(matching: $0, skills: ComposerSlashPalette.defaultSkills)
    } ?? []
    let isSlashPaletteVisible = slashQuery != nil && !slashItems.isEmpty

    // Web hero pill: full capsule, plus left, mic/send inside the right.
    HStack(spacing: JovieSpacing.small) {
      Button {
        isShowingWorkflowSheet = true
      } label: {
        Image(systemName: "plus")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(
            isPlusEnabled ? JovieColor.textPrimary : JovieColor.textTertiary
          )
          .frame(width: ChatComposerMetrics.plusButtonSize, height: ChatComposerMetrics.plusButtonSize)
      }
      .buttonStyle(.plain)
      .disabled(!isPlusEnabled)
      .accessibilityLabel("Open workflow sheet")
      .accessibilityIdentifier("chat-composer-plus")
      .accessibilityElement(children: .ignore)

      TextField(placeholder, text: $draft)
        .focused($isFocused)
        .textInputAutocapitalization(.sentences)
        .disableAutocorrection(false)
        .font(JovieFont.body(size: 16))
        .foregroundStyle(JovieColor.textPrimary)
        .accessibilityLabel(ChatComposerCopy.inputAccessibilityLabel)
        .accessibilityIdentifier(ChatComposerCopy.inputAccessibilityIdentifier)
        .onChange(of: draft) {
          onDraftEdited()
        }

      // Stable trailing slot: mic when empty, send when typed. No layout shift.
      ZStack {
        switch trailing {
        case .mic:
          micButton
        case .send:
          sendButton(trimmedDraft: trimmedDraft)
        }
      }
      .frame(width: ChatComposerMetrics.sendSlotSize, height: ChatComposerMetrics.sendSlotSize)
    }
    .padding(.leading, 10)
    .padding(.trailing, 8)
    .padding(.vertical, 8)
    .frame(minHeight: ChatComposerMetrics.barHeight)
    .background(.ultraThinMaterial, in: Capsule())
    .overlay {
      Capsule()
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("chat-composer")
    .overlay(alignment: .top) {
      // Anchored ABOVE the bar via alignmentGuide so the transcript and the
      // bar itself never reflow — zero layout shift by construction.
      Group {
        if isSlashPaletteVisible {
          ComposerSlashPaletteView(items: slashItems) { item in
            commitSlashItem(item)
          }
          .alignmentGuide(.top) { dimensions in
            dimensions[.bottom] + JovieSpacing.small
          }
          .transition(slashPaletteTransition)
        }
      }
      .animation(
        isSlashPaletteVisible ? JovieMotion.cinematic : JovieMotion.subtle,
        value: isSlashPaletteVisible
      )
    }
    .sheet(isPresented: $isShowingWorkflowSheet) {
      ComposerWorkflowSheet { action in
        isShowingWorkflowSheet = false
        onSelectWorkflow(action)
      }
      .presentationDetents([.height(ComposerWorkflowSheetHeight.estimated)])
      .presentationDragIndicator(.visible)
      .presentationBackground(JovieColor.surface0)
    }
  }

  /// Entry: opacity 0→1 + offset y +8→0 on cinematic; exit: opacity-only on
  /// subtle (exits faster than enters). Under Reduce Motion the offset
  /// movement is dropped and only opacity remains.
  private var slashPaletteTransition: AnyTransition {
    let insertion: AnyTransition =
      reduceMotion
      ? .opacity
      : .opacity.combined(with: .offset(y: 8))
    return .asymmetric(
      insertion: insertion.animation(JovieMotion.cinematic),
      removal: AnyTransition.opacity.animation(JovieMotion.subtle)
    )
  }

  private func commitSlashItem(_ item: ComposerSlashItem) {
    switch item {
    case let .workflow(action):
      // Same prompt-injection path as the plus-button workflow sheet; the
      // injected prompt no longer starts with a bare "/", which dismisses
      // the palette.
      onSelectWorkflow(action)
    case .skill:
      if let committed = ComposerSlashPalette.committedDraft(for: item) {
        // "/skill:id " contains ":" so the palette dismisses immediately.
        draft = committed
      }
    }
  }

  private var micButton: some View {
    Button(action: onMic) {
      Image(systemName: "mic.fill")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .frame(width: ChatComposerMetrics.sendSlotSize, height: ChatComposerMetrics.sendSlotSize)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(ChatComposerTrailingAction.mic.accessibilityLabel)
    .accessibilityIdentifier(ChatComposerTrailingAction.mic.accessibilityIdentifier)
    .accessibilityHint("Opens voice capture")
  }

  private func sendButton(trimmedDraft: String) -> some View {
    Button(action: onSend) {
      Image(systemName: isSending ? "ellipsis" : "arrow.up")
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(
          ChatComposerMetrics.isSendEnabled(trimmedDraft: trimmedDraft, isSending: isSending)
            ? JovieColor.backgroundBase
            : JovieColor.textTertiary
        )
        .frame(width: ChatComposerMetrics.sendSlotSize, height: ChatComposerMetrics.sendSlotSize)
        .background(
          ChatComposerMetrics.isSendEnabled(trimmedDraft: trimmedDraft, isSending: isSending)
            ? Color.white
            : JovieColor.surface2,
          in: Circle()
        )
    }
    .buttonStyle(.plain)
    .disabled(!ChatComposerMetrics.isSendEnabled(trimmedDraft: trimmedDraft, isSending: isSending))
    .accessibilityLabel(ChatComposerTrailingAction.send.accessibilityLabel)
    .accessibilityIdentifier(ChatComposerTrailingAction.send.accessibilityIdentifier)
  }
}

// MARK: - Slash command palette (typed "/" in the composer)

/// One row in the composer slash palette: either a workflow shortcut
/// (mirrors the plus-button sheet) or a `/skill:id` chat skill.
enum ComposerSlashItem: Identifiable, Equatable {
  case workflow(ComposerWorkflowAction)
  case skill(id: String, label: String)

  var id: String {
    switch self {
    case let .workflow(action):
      return "workflow-\(action.rawValue)"
    case let .skill(id, _):
      return "skill-\(id)"
    }
  }

  var title: String {
    switch self {
    case let .workflow(action):
      return action.title
    case let .skill(_, label):
      return label
    }
  }
}

/// Pure logic for the composer slash palette. Mirrors the web
/// `SlashCommandMenu`: typing a leading "/" opens the palette, typing
/// filters it live, committing a row injects the workflow prompt or a
/// `/skill:id ` token, and anything that stops being a bare in-progress
/// slash command dismisses it.
enum ComposerSlashPalette {
  static let maxSkillItems = 8

  /// Skills offered by the palette, derived from the shared `/skill:id`
  /// label registry, sorted by display label for stable presentation.
  static var defaultSkills: [(id: String, label: String)] {
    MobileChatSkillLabels.registry
      .map { (id: $0.key, label: $0.value) }
      .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
  }

  /// Returns the filter query when `draft` is a bare slash command in
  /// progress (leading "/", no whitespace, no ":"), else nil. Nil means the
  /// palette is closed: an empty draft, prose, a committed `/skill:id `
  /// token, and "/ hi" (whitespace after the slash) all dismiss it.
  static func query(from draft: String) -> String? {
    guard draft.hasPrefix("/") else { return nil }
    let query = String(draft.dropFirst())
    guard !query.contains(where: \.isWhitespace), !query.contains(":") else { return nil }
    return query
  }

  /// Case-insensitive contains filtering. All matching workflows first
  /// (stable `allCases` order), then up to `maxSkillItems` skills in the
  /// caller's order. An empty query returns everything.
  static func items(
    matching query: String,
    skills: [(id: String, label: String)]
  ) -> [ComposerSlashItem] {
    let workflows = ComposerWorkflowAction.allCases
      .filter { matches(query, candidate: $0.title) }
      .map(ComposerSlashItem.workflow)

    let skillItems = skills
      .filter { matches(query, candidate: $0.label) || matches(query, candidate: $0.id) }
      .prefix(maxSkillItems)
      .map { ComposerSlashItem.skill(id: $0.id, label: $0.label) }

    return workflows + skillItems
  }

  /// Draft text a commit writes back into the composer, or nil when the
  /// commit is handled by the existing workflow prompt-injection path
  /// (`onSelectWorkflow`, same as the plus-button sheet).
  static func committedDraft(for item: ComposerSlashItem) -> String? {
    switch item {
    case .workflow:
      return nil
    case let .skill(id, _):
      return "/skill:\(id) "
    }
  }

  private static func matches(_ query: String, candidate: String) -> Bool {
    guard !query.isEmpty else { return true }
    return candidate.range(of: query, options: .caseInsensitive) != nil
  }
}

enum ComposerSlashPaletteMetrics {
  static let rowHeight: CGFloat = 44
  static let headerHeight: CGFloat = 24
  static let maxHeight: CGFloat = 320

  static func estimatedHeight(workflowCount: Int, skillCount: Int) -> CGFloat {
    var height = JovieSpacing.small * 2
    var sectionCount = 0
    if workflowCount > 0 {
      sectionCount += 1
      height += headerHeight
      height += CGFloat(workflowCount) * rowHeight
    }
    if skillCount > 0 {
      sectionCount += 1
      height += headerHeight
      height += CGFloat(skillCount) * rowHeight
    }
    if sectionCount == 2 {
      height += JovieSpacing.small
    }
    return min(maxHeight, height)
  }
}

private struct ComposerSlashPaletteView: View {
  let items: [ComposerSlashItem]
  let onSelect: (ComposerSlashItem) -> Void

  private var workflows: [ComposerSlashItem] {
    items.filter { if case .workflow = $0 { return true } else { return false } }
  }

  private var skills: [ComposerSlashItem] {
    items.filter { if case .skill = $0 { return true } else { return false } }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: JovieSpacing.small) {
        if !workflows.isEmpty {
          section(header: "Suggestions", items: workflows)
        }
        if !skills.isEmpty {
          section(header: "Skills", items: skills)
        }
      }
      .padding(JovieSpacing.small)
    }
    .frame(
      height: ComposerSlashPaletteMetrics.estimatedHeight(
        workflowCount: workflows.count,
        skillCount: skills.count
      )
    )
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("composer-slash-palette")
  }

  private func section(header: String, items: [ComposerSlashItem]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(header)
        .font(JovieFont.body(size: 12, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)
        .frame(height: ComposerSlashPaletteMetrics.headerHeight)
        .padding(.horizontal, JovieSpacing.medium)

      ForEach(items) { item in
        Button {
          onSelect(item)
        } label: {
          ComposerSlashPaletteRow(item: item)
        }
        .buttonStyle(ComposerSlashRowButtonStyle())
        .accessibilityLabel(item.title)
        .accessibilityIdentifier("composer-slash-\(item.id)")
      }
    }
  }
}

private struct ComposerSlashPaletteRow: View {
  let item: ComposerSlashItem

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      icon
        .frame(width: 24, height: 24)

      Text(item.title)
        .font(JovieFont.body(size: 15))
        .foregroundStyle(JovieColor.textPrimary)
        .lineLimit(1)

      Spacer(minLength: 0)
    }
    .padding(.horizontal, JovieSpacing.medium)
    .frame(height: ComposerSlashPaletteMetrics.rowHeight)
    .contentShape(RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
  }

  @ViewBuilder
  private var icon: some View {
    switch item {
    case let .workflow(action):
      Image(systemName: action.systemImage)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
    case .skill:
      Circle()
        .fill(JovieColor.accent)
        .frame(width: 6, height: 6)
    }
  }
}

/// Press feedback for palette rows: background highlight only (no offset,
/// no scale) on `JovieMotion.subtle`.
private struct ComposerSlashRowButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
          .fill(configuration.isPressed ? JovieColor.surface3 : Color.clear)
      )
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}
