import SwiftUI

enum MobileChatInlineFragment: Equatable {
  case text(String)
  case lineBreak
  case entity(kind: MobileChatEntityKind, id: String, label: String)
  case skill(label: String)

  static func fragments(from runs: [MobileChatProseRun]) -> [MobileChatInlineFragment] {
    var result: [MobileChatInlineFragment] = []
    result.reserveCapacity(runs.count)

    for run in runs {
      switch run {
      case let .text(value):
        appendTextFragments(value, into: &result)
      case let .entity(kind, id, label):
        result.append(.entity(kind: kind, id: id, label: label))
      case let .skill(_, label):
        result.append(.skill(label: label))
      }
    }

    return result
  }

  private static func appendTextFragments(
    _ value: String,
    into result: inout [MobileChatInlineFragment]
  ) {
    guard !value.isEmpty else { return }

    var start = value.startIndex
    for index in value.indices {
      guard value[index] == "\n" else { continue }

      if start < index {
        result.append(.text(String(value[start ..< index])))
      }
      result.append(.lineBreak)
      start = value.index(after: index)
    }

    if start < value.endIndex {
      result.append(.text(String(value[start...])))
    }
  }
}

private struct MobileChatFlowLineBreakKey: LayoutValueKey {
  static let defaultValue = false
}

private struct MobileChatFlowLineBreak: View {
  var body: some View {
    Color.clear
      .frame(width: 0, height: 0)
      .layoutValue(key: MobileChatFlowLineBreakKey.self, value: true)
  }
}

/// Wraps inline text, entity chips, and skill labels left-to-right with
/// wrapping — the SwiftUI equivalent of web `TokenizedText`'s
/// `whitespace-pre-wrap` chip row.
struct MobileChatInlineFlowLayout: Layout {
  var spacing: CGFloat = 4
  var rowSpacing: CGFloat = 4

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    let maxWidth = proposal.width ?? .infinity
    guard maxWidth.isFinite, maxWidth > 0 else {
      return CGSize(
        width: subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(0, +),
        height: subviews.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
      )
    }

    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var usedWidth: CGFloat = 0

    for subview in subviews {
      if subview[MobileChatFlowLineBreakKey.self] {
        x = 0
        y += rowHeight + rowSpacing
        rowHeight = 0
        continue
      }

      let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
      if x > 0, x + size.width > maxWidth {
        x = 0
        y += rowHeight + rowSpacing
        rowHeight = 0
      }

      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
      usedWidth = max(usedWidth, x - spacing)
    }

    let width = maxWidth.isFinite ? min(maxWidth, usedWidth) : usedWidth
    return CGSize(width: width, height: y + rowHeight)
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    let maxWidth = bounds.width
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0

    for subview in subviews {
      if subview[MobileChatFlowLineBreakKey.self] {
        x = bounds.minX
        y += rowHeight + rowSpacing
        rowHeight = 0
        continue
      }

      let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += rowHeight + rowSpacing
        rowHeight = 0
      }

      subview.place(
        at: CGPoint(x: x, y: y),
        anchor: .topLeading,
        proposal: ProposedViewSize(width: size.width, height: size.height)
      )

      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
    }
  }
}

/// Renders tokenized prose with inline entity pill chips (thumbnail slot +
/// label) and skill mentions as styled text. Replaces the JOV-3608 v1
/// `Text`-concatenation path, which could not reserve thumbnail space.
struct MobileChatInlineProseView: View {
  let runs: [MobileChatProseRun]
  let tone: MobileChatProseTone
  let font: Font
  let textColor: Color

  private var fragments: [MobileChatInlineFragment] {
    MobileChatInlineFragment.fragments(from: runs)
  }

  var body: some View {
    MobileChatInlineFlowLayout(spacing: 4, rowSpacing: 2) {
      ForEach(Array(fragments.enumerated()), id: \.offset) { _, fragment in
        fragmentView(for: fragment)
      }
    }
  }

  @ViewBuilder
  private func fragmentView(for fragment: MobileChatInlineFragment) -> some View {
    switch fragment {
    case let .text(value):
      Text(value)
        .font(font)
        .foregroundStyle(textColor)
    case .lineBreak:
      MobileChatFlowLineBreak()
    case let .entity(kind, id, label):
      MobileChatEntityChipView(kind: kind, id: id, label: label, tone: tone)
    case let .skill(label):
      Text(label)
        .font(font.weight(.medium))
        .foregroundStyle(skillLabelColor)
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
}