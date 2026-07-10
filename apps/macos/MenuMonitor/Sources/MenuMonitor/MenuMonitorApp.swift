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
      MenuBarLabel(count: store.inProgressCount)
    }
    .menuBarExtraStyle(.menu)
  }
}

/// Menu bar icon + optional red badge with shipping count.
struct MenuBarLabel: View {
  let count: Int

  var body: some View {
    // Template image so macOS renders correctly in light/dark menu bar.
    Label {
      if count > 0 {
        Text(badgeText)
      }
    } icon: {
      Image(systemName: "shippingbox.fill")
    }
    .labelStyle(.titleAndIcon)
    .help(count == 0 ? "No issues shipping" : "\(count) issues shipping")
  }

  private var badgeText: String {
    count > 99 ? "99+" : "\(count)"
  }
}

struct MenuMonitorMenu: View {
  @ObservedObject var store: ShippingStatusStore

  var body: some View {
    Group {
      Text("In Progress: \(store.inProgressCount) issues shipping")
      Text("Ready: \(store.readyCount) cards waiting")
      Text("Blocked: \(store.blockedCount) cards blocked")

      if let refreshed = store.lastRefreshDescription {
        Text("Updated \(refreshed)")
          .foregroundStyle(.secondary)
      }

      if let error = store.lastError {
        Text(error)
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

      if let status = store.statusOutput, !status.isEmpty {
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
      Button("Quit") {
        NSApplication.shared.terminate(nil)
      }
    }
    .task {
      await store.start()
    }
  }
}
