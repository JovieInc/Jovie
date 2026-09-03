import SwiftUI

struct FeatureIntroHost: View {
  let catalog: FeatureIntroCatalog
  let changelogURL: URL
  let onHighlightCTA: () -> Void

  @AppStorage(FeatureIntroStorage.dismissedHighlightIDKey)
  private var dismissedHighlightID = ""
  @AppStorage(FeatureIntroStorage.dismissedWhatsNewIDKey)
  private var dismissedWhatsNewID = ""
  @Environment(\.openURL) private var openURL

  private var presentation: FeatureIntroKind? {
    FeatureIntroPresentation.resolve(
      catalog: catalog,
      dismissedHighlightID: dismissedHighlightID,
      dismissedWhatsNewID: dismissedWhatsNewID
    )
  }

  var body: some View {
    Group {
      if let presentation {
        FeatureIntroCard(
          presentation: presentation,
          onDismiss: { dismiss(presentation) },
          onPrimaryCTA: onHighlightCTA,
          onOpenChangelog: { openURL(changelogURL) }
        )
        .accessibilityIdentifier("feature-intro-card")
        .transition(.opacity)
      }
    }
    .animation(JovieMotion.subtle, value: presentation != nil)
  }

  private func dismiss(_ presentation: FeatureIntroKind) {
    switch presentation {
    case .highlight(let highlight):
      dismissedHighlightID = highlight.id
    case .whatsNew(let id, _):
      dismissedWhatsNewID = id
    }
  }
}

struct FeatureIntroCard: View {
  let presentation: FeatureIntroKind
  let onDismiss: () -> Void
  let onPrimaryCTA: () -> Void
  let onOpenChangelog: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.medium) {
      header
      content
    }
    .padding(JovieSpacing.large)
    .frame(maxWidth: .infinity, alignment: .leading)
    .jovieSurface(radius: JovieRadius.xLarge)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(accessibilityLabel)
  }

  @ViewBuilder
  private var header: some View {
    HStack(alignment: .top, spacing: JovieSpacing.medium) {
      switch presentation {
      case .highlight(let highlight):
        Image(systemName: highlight.systemImage)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.accent)
          .frame(width: 32, height: 32)
          .background(JovieColor.surface0, in: Circle())
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text(highlight.title)
            .font(JovieFont.body(size: 16, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
          Text(highlight.oneLine)
            .font(JovieFont.body(size: 14))
            .foregroundStyle(JovieColor.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

      case .whatsNew:
        Text("What’s New")
          .font(JovieFont.body(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      dismissButton
    }
  }

  @ViewBuilder
  private var content: some View {
    switch presentation {
    case .highlight(let highlight):
      Button(highlight.ctaTitle, action: onPrimaryCTA)
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("feature-intro-cta")

    case .whatsNew(_, let rows):
      VStack(alignment: .leading, spacing: JovieSpacing.small) {
        ForEach(rows) { row in
          switch row {
          case .bullet(let bullet):
            FeatureIntroBulletRow(bullet: bullet)
          case .andMore:
            Button(action: onOpenChangelog) {
              FeatureIntroAndMoreRow()
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("feature-intro-and-more")
          }
        }
      }
    }
  }

  private var dismissButton: some View {
    Button(action: onDismiss) {
      Image(systemName: "xmark")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Dismiss")
    .accessibilityIdentifier("feature-intro-dismiss")
  }

  private var accessibilityLabel: String {
    switch presentation {
    case .highlight(let highlight):
      return "\(highlight.title). \(highlight.oneLine)"
    case .whatsNew:
      return "What’s New"
    }
  }
}

private struct FeatureIntroBulletRow: View {
  let bullet: FeatureIntroBullet

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: JovieSpacing.medium) {
      Circle()
        .fill(color(for: bullet.accent))
        .frame(width: 8, height: 8)
        .accessibilityHidden(true)
      Text(bullet.text)
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .combine)
  }

  private func color(for accent: FeatureIntroAccent) -> Color {
    switch accent {
    case .accent: return JovieColor.accent
    case .blue: return JovieColor.accentBlue
    case .orange: return JovieColor.accentOrange
    }
  }
}

private struct FeatureIntroAndMoreRow: View {
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: JovieSpacing.medium) {
      Circle()
        .fill(JovieColor.textTertiary)
        .frame(width: 8, height: 8)
        .accessibilityHidden(true)
      Text("And more")
        .font(JovieFont.body(size: 14, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .underline()
    }
    .accessibilityLabel("And more, opens changelog")
  }
}
