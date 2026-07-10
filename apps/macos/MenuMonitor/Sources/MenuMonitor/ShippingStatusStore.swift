import AppKit
import Foundation

/// Polls Hermes kanban (or GitHub fallback) for shipping counts and runs ops actions.
@MainActor
final class ShippingStatusStore: ObservableObject {
  @Published private(set) var inProgressCount: Int = 0
  @Published private(set) var readyCount: Int = 0
  @Published private(set) var blockedCount: Int = 0
  @Published private(set) var lastError: String?
  @Published private(set) var lastRefresh: Date?
  @Published private(set) var statusOutput: String?
  @Published private(set) var actionMessage: String?

  private var pollTask: Task<Void, Never>?
  private let boardSlug = "jovie-product"
  private let dashboardURL = URL(string: "https://linear.app/jovie")!
  private let pollIntervalNanoseconds: UInt64 = 30 * 1_000_000_000

  var lastRefreshDescription: String? {
    guard let lastRefresh else { return nil }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .abbreviated
    return formatter.localizedString(for: lastRefresh, relativeTo: Date())
  }

  func start() async {
    await refresh()
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: self?.pollIntervalNanoseconds ?? 30_000_000_000)
        guard !Task.isCancelled else { break }
        await self?.refresh()
      }
    }
  }

  func refresh() async {
    do {
      let counts = try await Self.fetchKanbanCounts(board: boardSlug)
      inProgressCount = counts.inProgress
      readyCount = counts.ready
      blockedCount = counts.blocked
      lastError = nil
      lastRefresh = Date()
    } catch {
      // GitHub fallback when hermes kanban is unavailable
      do {
        let ghCount = try await Self.fetchGitHubInProgressCount()
        inProgressCount = ghCount
        readyCount = 0
        blockedCount = 0
        lastError = "Kanban unavailable — GitHub fallback (\(error.localizedDescription))"
        lastRefresh = Date()
      } catch {
        lastError = error.localizedDescription
      }
    }
  }

  func restartGateway() async {
    actionMessage = "Restarting Hermes gateway…"
    let result = await Self.runShell(
      "/bin/zsh",
      args: ["-lc", "command -v hermes >/dev/null && hermes gateway restart || echo 'hermes not found'"]
    )
    statusOutput = result
    actionMessage = "Gateway restart finished"
    await refresh()
  }

  func restartDaemons() async {
    actionMessage = "Restarting orchestrator + webhook…"
    let script = """
    set -e
    if command -v launchctl >/dev/null 2>&1; then
      launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway" 2>/dev/null || true
      launchctl kickstart -k "gui/$(id -u)/ai.hermes.orchestrator" 2>/dev/null || true
      launchctl kickstart -k "gui/$(id -u)/ai.hermes.webhook" 2>/dev/null || true
    fi
    if command -v hermes >/dev/null 2>&1; then
      hermes gateway restart 2>/dev/null || true
    fi
    echo "daemon restart attempted"
    """
    let result = await Self.runShell("/bin/zsh", args: ["-lc", script])
    statusOutput = result
    actionMessage = "Daemons restart finished"
    await refresh()
  }

  func runStatusCheck() async {
    actionMessage = "Running status check…"
    let script = """
    if [ -x "$HOME/.hermes/scripts/status-check.py" ]; then
      python3 "$HOME/.hermes/scripts/status-check.py" 2>&1 | tail -40
    elif command -v hermes >/dev/null 2>&1; then
      hermes status 2>&1 | tail -40
    else
      echo "No status-check.py or hermes CLI found"
    fi
    """
    let result = await Self.runShell("/bin/zsh", args: ["-lc", script])
    statusOutput = result
    actionMessage = nil
  }

  func openDashboard() {
    NSWorkspace.shared.open(dashboardURL)
  }

  // MARK: - Fetchers

  struct Counts: Sendable {
    var inProgress: Int
    var ready: Int
    var blocked: Int
  }

  nonisolated static func fetchKanbanCounts(board: String) async throws -> Counts {
    try await Task.detached(priority: .utility) {
      let json = try runProcess(
        "/bin/zsh",
        args: [
          "-lc",
          "hermes kanban --board \(board) list --json 2>/dev/null",
        ]
      )
      guard let data = json.data(using: .utf8),
            let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
      else {
        throw NSError(
          domain: "MenuMonitor",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid kanban JSON"]
        )
      }
      var inProgress = 0
      var ready = 0
      var blocked = 0
      for row in rows {
        let status = ((row["status"] as? String) ?? "").lowercased()
        switch status {
        case "in_progress", "in-progress", "running", "shipping":
          inProgress += 1
        case "ready", "todo", "queued":
          ready += 1
        case "blocked":
          blocked += 1
        default:
          break
        }
      }
      return Counts(inProgress: inProgress, ready: ready, blocked: blocked)
    }.value
  }

  nonisolated static func fetchGitHubInProgressCount() async throws -> Int {
    try await Task.detached(priority: .utility) {
      let json = try runProcess(
        "/bin/zsh",
        args: [
          "-lc",
          "gh issue list -R JovieInc/Jovie --state open --label 'status:in-progress' --json number --limit 100 2>/dev/null",
        ]
      )
      guard let data = json.data(using: .utf8),
            let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
      else {
        return 0
      }
      return rows.count
    }.value
  }

  nonisolated static func runShell(_ launchPath: String, args: [String]) async -> String {
    await Task.detached(priority: .utility) {
      (try? runProcess(launchPath, args: args)) ?? "Command failed"
    }.value
  }

  nonisolated static func runProcess(_ launchPath: String, args: [String]) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: launchPath)
    process.arguments = args
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe
    try process.run()
    process.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if process.terminationStatus != 0, output.isEmpty {
      throw NSError(
        domain: "MenuMonitor",
        code: Int(process.terminationStatus),
        userInfo: [NSLocalizedDescriptionKey: "Process exited \(process.terminationStatus)"]
      )
    }
    return output
  }
}
