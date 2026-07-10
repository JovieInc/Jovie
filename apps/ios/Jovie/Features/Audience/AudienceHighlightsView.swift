import SwiftUI

struct AudienceHighlightsView: View {
  let state: AudienceHighlightsLoadState
  let isOffline: Bool
  let onRetry: () async -> Void
  let onAskJovie: (String) -> Void

  // Guards the stat-tile entrance stagger to the very first successful load
  // only -- subsequent revalidates (pull-to-refresh, background refetch) must
  // never replay the animation on data the user is already looking at.
  @State private var didAnimateStatTilesIn = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private static let numberFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    return formatter
  }()

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
          header
          content
        }
        .padding(JovieSpacing.xLarge)
      }
    }
    .accessibilityIdentifier("audience-highlights")
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text("Audience")
        .font(JovieFont.display(size: 28))
        .foregroundStyle(JovieColor.textPrimary)

      Text("Read-only highlights. Open Jovie on web for tables, segments, and exports.")
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textTertiary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityIdentifier("audience-highlights-header")
  }

  @ViewBuilder
  private var content: some View {
    switch state {
    case .idle, .loading:
      skeleton
    case let .error(message):
      VStack(spacing: JovieSpacing.large) {
        Text(message)
          .font(JovieFont.body(size: 16, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
          .multilineTextAlignment(.center)

        Button("Retry") {
          Task { await onRetry() }
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
      }
      .frame(maxWidth: .infinity, minHeight: 280)
    case let .loaded(response):
      loadedContent(response: response)
    }
  }

  private var skeleton: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(height: 132)
      LazyVGrid(
        columns: [
          GridItem(.flexible(), spacing: JovieSpacing.medium),
          GridItem(.flexible(), spacing: JovieSpacing.medium),
        ],
        spacing: JovieSpacing.medium
      ) {
        ForEach(0..<4, id: \.self) { _ in
          skeletonStatTile
        }
      }
      RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(height: 48)
    }
    .redacted(reason: .placeholder)
  }

  private func loadedContent(response: MobileAudienceHighlightsResponse) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      heroCard(response: response)

      LazyVGrid(
        columns: [
          GridItem(.flexible(), spacing: JovieSpacing.medium),
          GridItem(.flexible(), spacing: JovieSpacing.medium),
        ],
        spacing: JovieSpacing.medium
      ) {
        ForEach(Array(response.statTiles.enumerated()), id: \.element.id) { index, tile in
          statTile(tile)
            .statTileReveal(
              isRevealed: didAnimateStatTilesIn,
              delay: reduceMotion ? 0 : Double(index) * 0.05,
              reduceMotion: reduceMotion
            )
        }
      }
      .accessibilityIdentifier("audience-highlights-stat-tiles")
      .task {
        guard !didAnimateStatTilesIn else { return }

        if reduceMotion {
          didAnimateStatTilesIn = true
          return
        }

        // Let the grid lay out at opacity 0 for one frame before revealing,
        // otherwise SwiftUI coalesces the false->true state change and the
        // tiles never visibly animate in.
        try? await Task.sleep(nanoseconds: 20_000_000)
        didAnimateStatTilesIn = true
      }

      Button {
        onAskJovie(response.chatPrompt)
      } label: {
        HStack(spacing: JovieSpacing.medium) {
          Image(systemName: "sparkles")
            .font(.system(size: 16, weight: .semibold))

          Text("Ask Jovie about your audience")
            .font(JovieFont.body(size: 16, weight: .semibold))
            .multilineTextAlignment(.leading)

          Spacer(minLength: 0)
        }
        .foregroundStyle(JovieColor.textPrimary)
        .padding(.horizontal, JovieSpacing.large)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
            .stroke(JovieColor.borderDefault, lineWidth: 1)
        }
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("audience-highlights-ask-jovie")

      if isOffline {
        Text("Offline. Showing the last loaded audience highlights.")
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
  }

  private func heroCard(response: MobileAudienceHighlightsResponse) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text(response.rangeLabel)
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)

      Text(response.heroLabel)
        .font(JovieFont.body(size: 15, weight: .medium))
        .foregroundStyle(JovieColor.textSecondary)

      Text(format(response.heroValue))
        .font(JovieFont.display(size: 40))
        .foregroundStyle(JovieColor.textPrimary)
        .accessibilityIdentifier("audience-highlights-hero-value")

      if let heroDeltaLabel = response.heroDeltaLabel {
        Text(heroDeltaLabel)
          .font(JovieFont.body(size: 13, weight: .semibold))
          .foregroundStyle(JovieColor.accentBlue)
          .accessibilityIdentifier("audience-highlights-hero-delta")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(JovieSpacing.large)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("audience-highlights-hero")
  }

  // Mirrors loaded stat tiles (label + value, no hint) so skeleton → loaded
  // does not jump when highlights paint on a cold first load.
  private var skeletonStatTile: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(height: 14)
      RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(height: 24)
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
        .stroke(JovieColor.borderSubtle, lineWidth: 1)
    }
  }

  private func statTile(_ tile: MobileAudienceHighlightsStatTile) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      Text(tile.label)
        .font(JovieFont.body(size: 13, weight: .medium))
        .foregroundStyle(JovieColor.textTertiary)
        .lineLimit(2)

      Text(format(tile.value))
        .font(JovieFont.body(size: 24, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)

      if let hint = tile.hint {
        Text(hint)
          .font(JovieFont.body(size: 12, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
        .stroke(JovieColor.borderSubtle, lineWidth: 1)
    }
    .accessibilityIdentifier("audience-highlights-stat-\(tile.label)")
  }

  private func format(_ value: Int) -> String {
    Self.numberFormatter.string(from: NSNumber(value: value)) ?? "\(value)"
  }
}

// Decorative first-load stagger for stat tiles: fades + rises a short
// distance in, `delay` apart per tile. Opacity-only (no offset) and
// undelayed under Reduce Motion per motion.md §6. Guarded by the caller
// (`didAnimateStatTilesIn`) to first-load only -- never replays on
// revalidate/refresh.
private struct StatTileRevealModifier: ViewModifier {
  let isRevealed: Bool
  let delay: Double
  let reduceMotion: Bool

  func body(content: Content) -> some View {
    content
      .opacity(isRevealed ? 1 : 0)
      .offset(y: (reduceMotion || isRevealed) ? 0 : 8)
      .animation(
        reduceMotion ? nil : JovieMotion.easeOut().delay(delay),
        value: isRevealed
      )
  }
}

private extension View {
  func statTileReveal(isRevealed: Bool, delay: Double, reduceMotion: Bool) -> some View {
    modifier(StatTileRevealModifier(isRevealed: isRevealed, delay: delay, reduceMotion: reduceMotion))
  }
}