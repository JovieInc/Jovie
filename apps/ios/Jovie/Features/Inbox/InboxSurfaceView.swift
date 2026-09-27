import SwiftUI

/// Inbox action-loop surface (JOV-3632) with swipe-to-triage (JOV-3635).
/// Summer approval cards render full detail and post decisions to Jovie
/// (JOV-6670): swipe right approves, left rejects, tap opens the card.
struct InboxSurfaceView: View {
  let response: MobileActionLoopInboxResponse?
  let isLoading: Bool
  let isOffline: Bool
  var workspaceMode: MobileWorkspaceMode = .jovie
  let onRetry: () async -> Void
  let onAskJovie: (String) -> Void
  /// Returns true when the decision was recorded (or already decided), so the
  /// card leaves the inbox. Comment passes through to the decision endpoint.
  var onDecideSummerCard: (
    _ card: MobileSummerCard,
    _ decision: SummerCardDecision,
    _ comment: String?
  ) async -> Bool = { _, _, _ in false }

  /// Local triage state (thumbs) — not persisted in v1; keeps swipe discoverable.
  @State private var triageByID: [String: InboxTriage] = [:]
  @State private var dismissedIDs: Set<String> = []
  @State private var openedCard: MobileSummerCard?

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
    .sheet(item: $openedCard) { card in
      SummerCardDetailSheet(
        card: card,
        onDecide: { decision, comment in
          let decided = await onDecideSummerCard(card, decision, comment)
          if decided {
            withAnimation(JovieMotion.easeOut()) {
              _ = dismissedIDs.insert("summer-card:\(card.id)")
            }
          }
          return decided
        }
      )
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text("Inbox")
        .font(JovieFont.display(size: 22))
        .foregroundStyle(JovieColor.textPrimary)

      Text(headerSubtitle)
        .font(JovieFont.body(size: 13, weight: isOffline ? .regular : .medium))
        .foregroundStyle(isOffline ? JovieColor.textTertiary : JovieColor.textSecondary)
        .frame(maxWidth: .infinity, minHeight: 18, alignment: .leading)
        .opacity(headerSubtitle.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : 1)
        .accessibilityHidden(headerSubtitle.trimmingCharacters(in: .whitespaces).isEmpty)
    }
  }

  private var headerSubtitle: String {
    if isOffline {
      return "Offline — showing cached actions when available."
    }
    if let count = response?.pendingCount {
      if workspaceMode == .ovie {
        return count == 1 ? "1 pending approval" : "\(count) pending approvals"
      }
      return count == 1 ? "1 pending action" : "\(count) pending actions"
    }
    return " "
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
              },
              onDecide: { decision, comment in
                guard let card = item.summerCard else { return false }
                let decided = await onDecideSummerCard(card, decision, comment)
                if decided {
                  withAnimation(JovieMotion.easeOut()) {
                    _ = dismissedIDs.insert(item.id)
                  }
                }
                return decided
              },
              onOpenCard: item.summerCard == nil
                ? nil
                : { openedCard = item.summerCard }
            )
          }
        }

        Button {
          onAskJovie(response.chatPrompt)
        } label: {
          Text(workspaceMode.askChatLabel)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))
        .accessibilityIdentifier(
          workspaceMode == .ovie ? "inbox-ask-summer" : "inbox-ask-jovie"
        )
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
        Text(workspaceMode.askChatLabel)
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

      Button {
        onAskJovie("Help me triage my inbox.")
      } label: {
        Text(workspaceMode.askChatLabel)
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: false))
      .accessibilityIdentifier("inbox-ask-jovie")
      .disabled(true)
    }
  }
}

enum InboxTriage: Equatable, Sendable {
  case none
  case up
  case down
}

extension MobileSummerCard: Identifiable {}

private struct InboxActionCard: View {
  let item: MobileActionLoopInboxItem
  let triage: InboxTriage?
  let onTriage: (InboxTriage) -> Void
  let onDecide: (SummerCardDecision, String?) async -> Bool
  let onOpenCard: (() -> Void)?

  @State private var dragOffset: CGFloat = 0
  @State private var isSubmitting = false
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
        .onTapGesture {
          onOpenCard?()
        }
        .contextMenu {
          if item.summerCard != nil {
            Button("Approve") { decide(.approve) }
            Button("Reject") { decide(.reject) }
            Button("Open Card") { onOpenCard?() }
          } else {
            Button("Thumbs Up") { onTriage(.up) }
            Button("Thumbs Down") { onTriage(.down) }
          }
        }
    }
    .accessibilityIdentifier("inbox-item-\(item.id)")
    .accessibilityHint(
      item.summerCard == nil
        ? "Swipe right to approve, left to dismiss"
        : "Swipe right to approve, left to reject, tap to open"
    )
  }

  private func decide(_ decision: SummerCardDecision) {
    guard !isSubmitting else { return }
    isSubmitting = true
    Task {
      _ = await onDecide(decision, nil)
      isSubmitting = false
    }
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
      if let stillURL = item.stillImageURL {
        InboxStillImage(url: stillURL)
      }
      Text(item.title)
        .font(JovieFont.body(size: 16, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
      if let card = item.summerCard {
        Text(card.body)
          .font(JovieFont.body(size: 14))
          .foregroundStyle(JovieColor.textSecondary)
          .lineLimit(3)
          .fixedSize(horizontal: false, vertical: true)
        if let meta = summerCardMeta(card) {
          Text(meta)
            .font(JovieFont.body(size: 12, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
        }
      }
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
        if item.summerCard != nil {
          if horizontal > 80 {
            decide(.approve)
          } else if horizontal < -80 {
            decide(.reject)
          }
        } else if horizontal > 80 {
          onTriage(.up)
        } else if horizontal < -80 {
          onTriage(.down)
        }
      }
  }
}

private func summerCardMeta(_ card: MobileSummerCard) -> String? {
  var parts: [String] = []
  if let recipient = card.recipient, !recipient.isEmpty {
    parts.append("To \(recipient)")
  }
  if let amount = card.amountLabel {
    parts.append(amount)
  }
  return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

/// Full Summer approval card: body, recipient, amount, evidence links, and a
/// comment field that rides with the approve/reject decision.
private struct SummerCardDetailSheet: View {
  let card: MobileSummerCard
  let onDecide: (SummerCardDecision, String?) async -> Bool

  @Environment(\.dismiss) private var dismiss
  @State private var comment = ""
  @State private var isSubmitting = false
  @State private var decisionFailed = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.medium) {
          VStack(alignment: .leading, spacing: JovieSpacing.small) {
            if let meta = summerCardMeta(card) {
              Text(meta)
                .font(JovieFont.body(size: 12, weight: .medium))
                .foregroundStyle(JovieColor.textTertiary)
            }
            Text(card.body)
              .font(JovieFont.body(size: 15))
              .foregroundStyle(JovieColor.textPrimary)
              .fixedSize(horizontal: false, vertical: true)
            if let defaultIfSilent = card.defaultIfSilent, !defaultIfSilent.isEmpty {
              Text("If silent: \(defaultIfSilent)")
                .font(JovieFont.body(size: 13))
                .foregroundStyle(JovieColor.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
            }
          }

          if !card.evidenceURLs.isEmpty {
            VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
              Text("Evidence")
                .font(JovieFont.body(size: 12, weight: .semibold))
                .foregroundStyle(JovieColor.textTertiary)
              ForEach(card.evidenceURLs, id: \.absoluteString) { url in
                Link(destination: url) {
                  HStack(spacing: JovieSpacing.xSmall) {
                    Text(url.host ?? url.absoluteString)
                      .font(JovieFont.body(size: 13))
                      .lineLimit(1)
                      .truncationMode(.middle)
                    Image(systemName: "arrow.up.right")
                      .font(.system(size: 11, weight: .semibold))
                  }
                  .foregroundStyle(JovieColor.accent)
                }
                .accessibilityIdentifier("summer-card-evidence-\(url.absoluteString)")
              }
            }
          }

          TextField(
            "Comment (optional)",
            text: $comment,
            axis: .vertical
          )
          .lineLimit(3 ... 6)
          .font(JovieFont.body(size: 14))
          .foregroundStyle(JovieColor.textPrimary)
          .padding(JovieSpacing.small)
          .background(
            JovieColor.surface1,
            in: RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
          )
          .accessibilityIdentifier("summer-card-comment")

          if decisionFailed {
            Text("Could not record the decision. Try again.")
              .font(JovieFont.body(size: 13))
              .foregroundStyle(JovieColor.errorText)
              .accessibilityIdentifier("summer-card-decision-error")
          }

          HStack(spacing: JovieSpacing.small) {
            Button {
              decide(.reject)
            } label: {
              Text("Reject")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(JoviePillButtonStyle(filled: false))
            .accessibilityIdentifier("summer-card-reject")

            Button {
              decide(.approve)
            } label: {
              Text("Approve")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(JoviePillButtonStyle(filled: true))
            .accessibilityIdentifier("summer-card-approve")
          }
          .disabled(isSubmitting)
        }
        .padding(JovieSpacing.large)
      }
      .background(JovieColor.backgroundBase.ignoresSafeArea())
      .navigationTitle(card.kind.capitalized)
      #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
            .accessibilityIdentifier("summer-card-close")
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  private func decide(_ decision: SummerCardDecision) {
    guard !isSubmitting else { return }
    isSubmitting = true
    decisionFailed = false
    let trimmed = comment.trimmingCharacters(in: .whitespacesAndNewlines)
    Task {
      let decided = await onDecide(decision, trimmed.isEmpty ? nil : trimmed)
      isSubmitting = false
      if decided {
        dismiss()
      } else {
        decisionFailed = true
      }
    }
  }
}

private struct InboxStillImage: View {
  let url: URL
  @State private var image: UIImage?

  init(url: URL) {
    self.url = url
    _image = State(initialValue: AvatarImageCache.image(for: url))
  }

  var body: some View {
    Color.clear
      .aspectRatio(16 / 9, contentMode: .fit)
      .overlay {
        if let image {
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
        } else {
          JovieColor.surface0
        }
      }
      .clipped()
      .clipShape(RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous))
      .task(id: url.absoluteString) {
        guard image == nil else { return }
        image = await AvatarImageLoader.load(
          url,
          thumbnailSize: CGSize(width: 780, height: 439)
        )
      }
  }
}
