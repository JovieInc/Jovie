import SwiftUI

struct ChatComposerBar: View {
  @Binding var draft: String
  @FocusState.Binding var isFocused: Bool
  let placeholder: String
  let isSending: Bool
  let isPlusEnabled: Bool
  let onSend: () -> Void
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void
  let onDraftEdited: () -> Void

  @State private var isShowingWorkflowSheet = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let slashQuery = ComposerSlashPalette.query(from: draft)
    let slashItems = slashQuery.map {
      ComposerSlashPalette.items(matching: $0, skills: ComposerSlashPalette.defaultSkills)
    } ?? []
    let isSlashPaletteVisible = slashQuery != nil && !slashItems.isEmpty

    // JOV-3636: composer is text-only. Voice is shell Talk FAB → full-screen
    // overlay. OS keyboard mic still handles dictate-to-text.
    HStack(spacing: JovieSpacing.medium) {
      Button {
        isShowingWorkflowSheet = true
      } label: {
        Image(systemName: "plus")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(
            isPlusEnabled ? JovieColor.textPrimary : JovieColor.textTertiary
          )
          .frame(width: 36, height: 36)
          .background(JovieColor.surface2, in: Circle())
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
        .frame(height: 52)
        .onChange(of: draft) {
          onDraftEdited()
        }

      // Reserve a stable trailing 52pt slot so empty → typed never shifts layout.
      ZStack {
        if !trimmedDraft.isEmpty {
          sendButton(trimmedDraft: trimmedDraft)
        }
      }
      .frame(width: 52, height: 52)
    }
    .padding(.horizontal, JovieSpacing.large)
    .frame(height: 76)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
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

  private func sendButton(trimmedDraft: String) -> some View {
    Button(action: onSend) {
      Image(systemName: isSending ? "ellipsis" : "arrow.up")
        .font(.system(size: 16, weight: .bold))
        .foregroundStyle(
          trimmedDraft.isEmpty || isSending
            ? JovieColor.textTertiary
            : JovieColor.backgroundBase
        )
        .frame(width: 52, height: 52)
        .background(
          trimmedDraft.isEmpty || isSending ? JovieColor.surface2 : Color.white,
          in: Circle()
        )
    }
    .buttonStyle(.plain)
    .disabled(trimmedDraft.isEmpty || isSending)
    .accessibilityLabel("Send")
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

private enum ComposerSlashPaletteMetrics {
  static let rowHeight: CGFloat = 44
  static let headerHeight: CGFloat = 24
  static let maxHeight: CGFloat = 320
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
    .frame(height: min(ComposerSlashPaletteMetrics.maxHeight, estimatedContentHeight))
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("composer-slash-palette")
  }

  private var estimatedContentHeight: CGFloat {
    var height = JovieSpacing.small * 2
    var sectionCount = 0
    for sectionItems in [workflows, skills] where !sectionItems.isEmpty {
      sectionCount += 1
      height += ComposerSlashPaletteMetrics.headerHeight
      height += CGFloat(sectionItems.count) * ComposerSlashPaletteMetrics.rowHeight
    }
    if sectionCount == 2 {
      height += JovieSpacing.small
    }
    return height
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
