import SwiftUI

/// Inbox action-loop surface (JOV-3632) with swipe-to-triage (JOV-3635).
struct InboxSurfaceView: View {
  let response: MobileActionLoopInboxResponse?
  let isLoading: Bool
  let isOffline: Bool
  let onRetry: () async -> Void
  let onAskJovie: (String) -> Void

  /// Local triage state (thumbs) — not persisted in v1; keeps swipe discoverable.
  @State private var triageByID: [String: InboxTriage] = [:]
  @State private var dismissedIDs: Set<String> = []

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
          header
          content
        }
        .padding(JovieSpacing.large)
      }
    }
    .accessibilityIdentifier("inbox-surface")
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text("Inbox")
        .font(JovieFont.display(size: 22))
        .foregroundStyle(JovieColor.textPrimary)

      if isOffline {
        Text("Offline — showing cached actions when available.")
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
      } else if let count = response?.pendingCount {
        Text(count == 1 ? "1 pending action" : "\(count) pending actions")
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(JovieColor.textSecondary)
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    if let response {
      let visibleItems = response.items.filter { !dismissedIDs.contains($0.id) }

      if visibleItems.isEmpty {
        emptyState(response: response)
      } else {
        VStack(spacing: JovieSpacing.medium) {
          ForEach(visibleItems) { item in
            InboxActionCard(
              item: item,
              triage: triageByID[item.id],
              onTriage: { triage in
                triageByID[item.id] = triage
                if triage != .none {
                  withAnimation(JovieMotion.easeOut()) {
                    _ = dismissedIDs.insert(item.id)
                  }
                }
              }
            )
          }
        }

        Button {
          onAskJovie(response.chatPrompt)
        } label: {
          Text("Ask Jovie")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))
        .accessibilityIdentifier("inbox-ask-jovie")
      }
    } else if isLoading {
      skeleton
    } else {
      VStack(spacing: JovieSpacing.large) {
        Text("Could not load inbox.")
          .font(JovieFont.body(size: 16, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
        Button("Retry") {
          Task { await onRetry() }
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("inbox-retry")
      }
      .frame(maxWidth: .infinity, minHeight: 220)
    }
  }

  private func emptyState(response: MobileActionLoopInboxResponse) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.medium) {
      Text("You're caught up.")
        .font(JovieFont.body(size: 16, weight: .medium))
        .foregroundStyle(JovieColor.textSecondary)

      if !response.emptyActionCards.isEmpty {
        ForEach(response.emptyActionCards) { card in
          VStack(alignment: .leading, spacing: JovieSpacing.small) {
            Text(card.title)
              .font(JovieFont.body(size: 16, weight: .semibold))
              .foregroundStyle(JovieColor.textPrimary)
            Text(card.body)
              .font(JovieFont.body(size: 14))
              .foregroundStyle(JovieColor.textTertiary)
          }
          .padding(JovieSpacing.medium)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
        }
      }

      Button {
        onAskJovie(response.chatPrompt)
      } label: {
        Text("Ask Jovie")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: true))
    }
  }

  private var skeleton: some View {
    VStack(spacing: JovieSpacing.medium) {
      ForEach(0..<3, id: \.self) { _ in
        RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 110)
      }
    }
    .redacted(reason: .placeholder)
    .accessibilityHidden(true)
  }
}

enum InboxTriage: Equatable, Sendable {
  case none
  case up
  case down
}

private struct InboxActionCard: View {
  let item: MobileActionLoopInboxItem
  let triage: InboxTriage?
  let onTriage: (InboxTriage) -> Void

  @State private var dragOffset: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      HStack {
        triageGlyph(systemName: "hand.thumbsup.fill", color: JovieColor.accent)
          .opacity(dragOffset > 20 ? 1 : 0)
        Spacer()
        triageGlyph(systemName: "hand.thumbsdown.fill", color: JovieColor.errorText)
          .opacity(dragOffset < -20 ? 1 : 0)
      }
      .padding(.horizontal, JovieSpacing.large)

      cardBody
        .offset(x: reduceMotion ? 0 : dragOffset)
        .gesture(swipeGesture)
        .contextMenu {
          Button("Thumbs Up") { onTriage(.up) }
          Button("Thumbs Down") { onTriage(.down) }
        }
    }
    .accessibilityIdentifier("inbox-item-\(item.id)")
    .accessibilityHint("Swipe right to approve, left to dismiss")
  }

  private var cardBody: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      HStack {
        Text(item.typeLabel)
          .font(JovieFont.body(size: 12, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
        Spacer()
        Text(item.status.capitalized)
          .font(JovieFont.body(size: 12, weight: .medium))
          .foregroundStyle(JovieColor.textSecondary)
      }
      Text(item.title)
        .font(JovieFont.body(size: 16, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
      Text(item.why)
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textTertiary)
        .fixedSize(horizontal: false, vertical: true)
      Text(item.primaryActionLabel)
        .font(JovieFont.body(size: 14, weight: .semibold))
        .foregroundStyle(JovieColor.accent)
    }
    .padding(JovieSpacing.medium)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .stroke(JovieColor.borderSubtle, lineWidth: 1)
    }
  }

  private func triageGlyph(systemName: String, color: Color) -> some View {
    Image(systemName: systemName)
      .font(.system(size: 22, weight: .bold))
      .foregroundStyle(color)
      .frame(width: 40, height: 40)
  }

  private var swipeGesture: some Gesture {
    DragGesture(minimumDistance: 16)
      .onChanged { value in
        guard !reduceMotion else { return }
        let horizontal = value.translation.width
        guard abs(horizontal) > abs(value.translation.height) else { return }
        dragOffset = max(-120, min(120, horizontal))
      }
      .onEnded { value in
        defer { dragOffset = 0 }
        let horizontal = value.translation.width
        guard abs(horizontal) > abs(value.translation.height) * 1.2 else { return }
        if horizontal > 80 {
          onTriage(.up)
        } else if horizontal < -80 {
          onTriage(.down)
        }
      }
  }
}
