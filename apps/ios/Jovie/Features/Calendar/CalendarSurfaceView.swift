import SwiftUI

/// Calendar surface for the primary tab bar (JOV-3632). Consumes the mobile
/// action-loop calendar payload when loaded; otherwise shows a stable skeleton.
struct CalendarSurfaceView: View {
  let response: MobileActionLoopCalendarResponse?
  let isLoading: Bool
  let isOffline: Bool
  let onRetry: () async -> Void
  let onAskJovie: (String) -> Void

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
    .accessibilityIdentifier("calendar-surface")
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text(response?.rangeLabel ?? "Calendar")
        .font(JovieFont.display(size: 22))
        .foregroundStyle(JovieColor.textPrimary)

      if isOffline {
        Text("Offline — showing cached calendar when available.")
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
      } else if let pending = response?.pendingReviewCount, pending > 0 {
        Text("\(pending) pending review")
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(JovieColor.textSecondary)
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    if let response {
      if response.upcomingEvents.isEmpty,
         response.pendingEvents.isEmpty,
         response.upcomingReleases.isEmpty
      {
        emptyState(prompt: response.chatPrompt)
      } else {
        if !response.upcomingEvents.isEmpty {
          section(title: "Upcoming Events") {
            ForEach(response.upcomingEvents) { event in
              CalendarEventRow(event: event)
            }
          }
        }
        if !response.pendingEvents.isEmpty {
          section(title: "Needs Confirmation") {
            ForEach(response.pendingEvents) { event in
              CalendarEventRow(event: event)
            }
          }
        }
        if !response.upcomingReleases.isEmpty {
          section(title: "Releases") {
            ForEach(response.upcomingReleases) { release in
              CalendarReleaseRow(release: release)
            }
          }
        }

        Button {
          onAskJovie(response.chatPrompt)
        } label: {
          Text("Ask Jovie")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))
        .accessibilityIdentifier("calendar-ask-jovie")
      }
    } else if isLoading {
      skeleton
    } else {
      VStack(spacing: JovieSpacing.large) {
        Text("Could not load calendar.")
          .font(JovieFont.body(size: 16, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
        Button("Retry") {
          Task { await onRetry() }
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("calendar-retry")
      }
      .frame(maxWidth: .infinity, minHeight: 220)
    }
  }

  private func emptyState(prompt: String) -> some View {
    VStack(spacing: JovieSpacing.large) {
      Text("Nothing on the calendar yet.")
        .font(JovieFont.body(size: 16, weight: .medium))
        .foregroundStyle(JovieColor.textSecondary)
      Button {
        onAskJovie(prompt)
      } label: {
        Text("Plan With Jovie")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: true))
    }
    .frame(maxWidth: .infinity, minHeight: 200)
  }

  private var skeleton: some View {
    VStack(spacing: JovieSpacing.medium) {
      ForEach(0..<4, id: \.self) { _ in
        RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 72)
      }
    }
    .redacted(reason: .placeholder)
    .accessibilityHidden(true)
  }

  private func section<Content: View>(
    title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text(title)
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)
      content()
    }
  }
}

private struct CalendarEventRow: View {
  let event: MobileActionLoopCalendarEventItem

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      Text(event.title)
        .font(JovieFont.body(size: 16, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .lineLimit(1)
      Text(event.subtitle)
        .font(JovieFont.body(size: 13))
        .foregroundStyle(JovieColor.textTertiary)
        .lineLimit(2)
      HStack(spacing: JovieSpacing.small) {
        Text(event.eventType.capitalized)
          .font(JovieFont.body(size: 11, weight: .semibold))
          .foregroundStyle(JovieColor.textSecondary)
        if let badge = event.statusBadge {
          Text(badge)
            .font(JovieFont.body(size: 11, weight: .semibold))
            .foregroundStyle(JovieColor.textSecondary)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .accessibilityIdentifier("calendar-event-\(event.id)")
  }
}

private struct CalendarReleaseRow: View {
  let release: MobileActionLoopCalendarReleaseItem

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
        .fill(JovieColor.surface2)
        .frame(width: 48, height: 48)
        .overlay {
          Image(systemName: "opticaldisc")
            .foregroundStyle(JovieColor.textTertiary)
        }

      VStack(alignment: .leading, spacing: 4) {
        Text(release.title)
          .font(JovieFont.body(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)
        Text(release.status.capitalized)
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
      }
      Spacer(minLength: 0)
    }
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .accessibilityIdentifier("calendar-release-\(release.id)")
  }
}
