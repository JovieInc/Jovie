import AppKit
import SwiftUI

@main
struct MenuMonitorApp: App {
  @StateObject private var store = ShippingStatusStore()

  init() {
    // Menu-bar-only agent: hide Dock icon.
    NSApplication.shared.setActivationPolicy(.accessory)
  }

  var body: some Scene {
    MenuBarExtra {
      MenuMonitorMenu(store: store)
    } label: {
      MenuBarLabel(
        presentation: MenuBarPresentation(
          count: store.inProgressCount,
          hasLoaded: store.lastRefresh != nil,
          hasError: store.lastError != nil,
          actionMessage: store.actionMessage
        )
      )
    }
    .menuBarExtraStyle(.menu)
  }
}

/// Menu bar icon + optional red badge with shipping count.
struct MenuBarLabel: View {
  let presentation: MenuBarPresentation

  var body: some View {
    // Template image so macOS renders correctly in light/dark menu bar.
    Label {
      if let badgeText = presentation.badgeText {
        Text(badgeText)
      }
    } icon: {
      Image(systemName: "shippingbox.fill")
    }
    .labelStyle(.titleAndIcon)
    .help(presentation.helpText)
    .accessibilityLabel(presentation.accessibilityLabel)
    .accessibilityValue(presentation.accessibilityValue)
  }
}

struct MenuMonitorMenu: View {
  @ObservedObject var store: ShippingStatusStore

  var body: some View {
    let presentation = MenuMonitorPresentation(
      inProgressCount: store.inProgressCount,
      readyCount: store.readyCount,
      blockedCount: store.blockedCount,
      lastRefreshDescription: store.lastRefreshDescription,
      lastError: store.lastError,
      actionMessage: store.actionMessage,
      statusOutput: store.statusOutput
    )

    Group {
      ForEach(presentation.metrics) { metric in
        Text(presentation.text(for: metric))
      }

      if presentation.showsInitialLoading {
        Label("Refreshing shipping status…", systemImage: "arrow.triangle.2.circlepath")
          .foregroundStyle(.secondary)
      }

      if let refreshed = presentation.lastRefreshDescription {
        Label("Updated \(refreshed)", systemImage: "clock")
          .foregroundStyle(.secondary)
      }

      if let error = presentation.lastError {
        Label(error, systemImage: "exclamationmark.triangle.fill")
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      Divider()

      Button("Restart Hermes Gateway") {
        Task { await store.restartGateway() }
      }
      Button("Restart All Daemons") {
        Task { await store.restartDaemons() }
      }
      Button("Status Check") {
        Task { await store.runStatusCheck() }
      }

      if let actionMessage = presentation.actionMessage {
        Label(actionMessage, systemImage: "info.circle")
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      if let status = presentation.statusOutput, !status.isEmpty {
        Divider()
        Text(status)
          .font(.system(.caption, design: .monospaced))
          .lineLimit(12)
          .foregroundStyle(.secondary)
      }

      Divider()

      Button("Open Dashboard") {
        store.openDashboard()
      }
      Button("Refresh Now") {
        Task { await store.refresh() }
      }
      Button("Quit MenuMonitor") {
        NSApplication.shared.terminate(nil)
      }
      .keyboardShortcut("q")
    }
    .task {
      await store.start()
    }
  }
}
