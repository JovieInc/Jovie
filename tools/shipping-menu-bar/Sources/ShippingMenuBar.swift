import Foundation
import SwiftUI

// MARK: - Configuration

enum ShipperConfig {
    static let jobName = "codex-issue-shipper"
    static let launchdLabel = "co.jovie.hermes.cron-codex-issue-shipper"
    static let jobsLogPath = "\(NSHomeDirectory())/.hermes/logs/jobs.jsonl"
    static let pauseSentinelPath = "\(NSHomeDirectory())/.hermes/shipping-paused"
    static let maxLogLines = 200
}

// MARK: - Log event model

struct ShipperEvent: Decodable {
    let job: String
    let event: String
    let ts: String

    // scanned event fields
    let issueCount: Int?
    let dispatchableCount: Int?
    let skippedHuman: Int?
    let skippedNoAuto: Int?
    let batchCount: Int?
    let maxIssuesPerRun: Int?
    let maxParallelAgents: Int?
    let dryRun: Bool?
    let capacity: CapacitySnapshot?

    // dry_run_planned / dispatched fields
    let plans: [DispatchPlan]?

    // finish fields
    let durationMs: Int?

    // error / fatal fields
    let error: String?
    let stack: String?

    struct CapacitySnapshot: Decodable {
        let allowedAgents: Int
        let cpuCount: Int
        let freeMemoryMb: Int
        let loadAverage1m: Double
        let loadPerCpu: Double
        let reasons: [String]
    }

    struct DispatchPlan: Decodable {
        let issue: Int
        let branch: String
        let risk: String
        let model: String
    }
}

// MARK: - Status model

enum ShipperState: String {
    case running
    case paused
    case error
    case idle
    case notRunning

    var color: Color {
        switch self {
        case .running: return .green
        case .paused: return .yellow
        case .error: return .red
        case .idle: return .gray
        case .notRunning: return .gray
        }
    }

    var label: String {
        switch self {
        case .running: return "Running"
        case .paused: return "Paused"
        case .error: return "Error"
        case .idle: return "Idle"
        case .notRunning: return "Not Running"
        }
    }
}

struct ShipperStatus {
    var state: ShipperState = .notRunning
    var lastRun: String = "—"
    var lastResult: String = "—"
    var dispatchable: Int = 0
    var inProgress: Int = 0
    var capacity: ShipperEvent.CapacitySnapshot?
    var currentAgents: [String] = []
    var lastError: String?
    var isPaused: Bool = false
    var launchdActive: Bool = false
}

// MARK: - Log tailer

func tailLog(path: String, lines: Int) -> Data? {
    guard let fh = FileHandle(forReadingAtPath: path) else { return nil }
    defer { fh.closeFile() }

    // Seek to end, then walk backwards to find N newlines
    let fileSize = fh.seekToEndOfFile()
    if fileSize == 0 { return Data() }

    let chunkSize: UInt64 = 4096
    var buffer = Data()
    var newlineCount = 0
    var offset = fileSize

    while offset > 0 && newlineCount < lines {
        let readSize = min(chunkSize, offset)
        offset -= readSize
        fh.seek(toFileOffset: offset)
        guard let chunk = try? fh.read(upToCount: Int(readSize)) else { break }
        buffer = chunk + buffer
        newlineCount = buffer.filter { $0 == 0x0a }.count
    }

    return buffer
}

func parseEvents(data: Data) -> [ShipperEvent] {
    let decoder = JSONDecoder()
    return String(data: data, encoding: .utf8)?
        .split(separator: "\n")
        .compactMap { line in
            guard let d = line.data(using: .utf8) else { return nil }
            return try? decoder.decode(ShipperEvent.self, from: d)
        } ?? []
}

// MARK: - LaunchAgent status

func checkLaunchdStatus(label: String) -> Bool {
    let task = Process()
    task.launchPath = "/bin/launchctl"
    task.arguments = ["print", "gui/\(getuid())/\(label)"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = FileHandle.nullDevice
    do {
        try task.run()
    } catch {
        return false
    }
    task.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    guard let output = String(data: data, encoding: .utf8) else { return false }
    // "active count = N" tells us if it's currently running
    return output.contains("active count = 1") || output.contains("state = running")
}

func isLaunchdLoaded(label: String) -> Bool {
    let task = Process()
    task.launchPath = "/bin/launchctl"
    task.arguments = ["print", "gui/\(getuid())/\(label)"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = FileHandle.nullDevice
    do {
        try task.run()
    } catch {
        return false
    }
    task.waitUntilExit()
    return task.terminationStatus == 0
}

// MARK: - Build status from events

func buildStatus(events: [ShipperEvent]) -> ShipperStatus {
    var status = ShipperStatus()

    // Check pause sentinel
    status.isPaused = FileManager.default.fileExists(atPath: ShipperConfig.pauseSentinelPath)

    // Check launchd
    status.launchdActive = isLaunchdLoaded(label: ShipperConfig.launchdLabel)

    // Filter to this shipper's events
    let shipperEvents = events.filter { $0.job == ShipperConfig.jobName }

    // Find the most recent start event to determine if currently running
    let lastStart = shipperEvents.last(where: { $0.event == "start" })
    let lastFinish = shipperEvents.last(where: { $0.event == "finish" })
    let lastFatal = shipperEvents.last(where: { $0.event == "fatal" })
    _ = shipperEvents.last(where: { $0.event == "error" })

    // Determine if a run is in progress (start without a finish after it)
    if let start = lastStart, let finish = lastFinish {
        status.state = start.ts > finish.ts ? .running : .idle
    } else if lastStart != nil {
        status.state = .running
    } else {
        status.state = .idle
    }

    // Override with paused state
    if status.isPaused {
        status.state = .paused
    }

    // Check for recent fatal/error
    if let fatal = lastFatal {
        status.lastError = fatal.error
        // If fatal is more recent than last finish, mark error
        if lastFinish == nil || fatal.ts > lastFinish!.ts {
            if !status.isPaused { status.state = .error }
        }
    }

    // Last run time + result
    if let finish = lastFinish {
        status.lastRun = formatTimestamp(finish.ts)
        // Find the event just before finish to determine result
        if let idx = shipperEvents.lastIndex(where: { $0.event == "finish" && $0.ts == finish.ts }) {
            // Look backwards for the most recent meaningful event
            let preceding = shipperEvents[..<idx].reversed()
            if let evt = preceding.first {
                switch evt.event {
                case "empty_queue": status.lastResult = "Empty queue"
                case "capacity_throttled": status.lastResult = "Throttled"
                case "dry_run_planned": status.lastResult = "Dry run planned"
                case "singleton_active_skip": status.lastResult = "Singleton skip"
                case "scanned": status.lastResult = "Scanned"
                default: status.lastResult = "Finished"
                }
            }
        }
    }

    // Most recent scanned event for metrics
    if let scanned = shipperEvents.last(where: { $0.event == "scanned" }) {
        status.dispatchable = scanned.dispatchableCount ?? 0
        status.capacity = scanned.capacity
    }

    // Current agents from dry_run_planned or dispatched events
    if let planned = shipperEvents.last(where: { $0.event == "dry_run_planned" }),
       let plans = planned.plans {
        status.currentAgents = plans.map { "#\($0.issue) → \($0.branch)" }
    }

    // In-progress = batch count from last scanned
    if let scanned = shipperEvents.last(where: { $0.event == "scanned" }) {
        status.inProgress = scanned.batchCount ?? 0
    }

    return status
}

func formatTimestamp(_ iso: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: iso) else { return iso }
    let out = DateFormatter()
    out.dateStyle = .none
    out.timeStyle = .medium
    return out.string(from: date)
}

// MARK: - Control actions

func pauseShipping() {
    FileManager.default.createFile(
        atPath: ShipperConfig.pauseSentinelPath,
        contents: Data("paused by menu bar app\n".utf8),
        attributes: nil
    )
}

func resumeShipping() {
    try? FileManager.default.removeItem(atPath: ShipperConfig.pauseSentinelPath)
}

func restartShipper() {
    let task = Process()
    task.launchPath = "/bin/launchctl"
    task.arguments = ["kickstart", "-k", "gui/\(getuid())/\(ShipperConfig.launchdLabel)"]
    do {
        try task.run()
    } catch {
        // ignore
    }
}

// MARK: - SwiftUI App

@main
struct ShippingMenuBarApp: App {
    @StateObject private var model = MenuBarModel()

    var body: some Scene {
        MenuBarExtra {
            MenuBarContent(model: model)
        } label: {
            HStack(spacing: 4) {
                Circle()
                    .fill(model.status.state.color)
                    .frame(width: 8, height: 8)
                Image(systemName: "shippingbox")
            }
        }
    }
}

@MainActor
class MenuBarModel: ObservableObject {
    @Published var status = ShipperStatus()
    private var timer: Timer?

    init() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refresh()
            }
        }
    }

    func refresh() {
        guard let data = tailLog(path: ShipperConfig.jobsLogPath, lines: ShipperConfig.maxLogLines) else {
            return
        }
        let events = parseEvents(data: data)
        status = buildStatus(events: events)
    }

    func pause() {
        pauseShipping()
        refresh()
    }

    func resume() {
        resumeShipping()
        refresh()
    }

    func restart() {
        restartShipper()
        refresh()
    }
}

struct MenuBarContent: View {
    @ObservedObject var model: MenuBarModel

    var body: some View {
        // Status header
        Section {
            HStack {
                Circle()
                    .fill(model.status.state.color)
                    .frame(width: 10, height: 10)
                Text("Shipper: \(model.status.state.label)")
                    .font(.headline)
                Spacer()
            }
            .padding(.vertical, 2)
        }

        Divider()

        // Metrics
        Section {
            LabeledContent("Dispatchable issues", value: "\(model.status.dispatchable)")
            LabeledContent("In progress", value: "\(model.status.inProgress)")
            if let cap = model.status.capacity {
                LabeledContent("Capacity", value: "\(cap.allowedAgents)/\(model.status.status_maxParallelAgents)")
                LabeledContent("Free memory", value: "\(cap.freeMemoryMb) MB")
                LabeledContent("Load/cpu", value: String(format: "%.2f", cap.loadPerCpu))
            }
        }

        Divider()

        // Last run
        Section {
            LabeledContent("Last run", value: model.status.lastRun)
            LabeledContent("Result", value: model.status.lastResult)
        }

        // Current agents
        if !model.status.currentAgents.isEmpty {
            Divider()
            Section("Current agents") {
                ForEach(model.status.currentAgents, id: \.self) { agent in
                    Text(agent)
                        .font(.caption)
                        .lineLimit(1)
                }
            }
        }

        // Error display
        if let err = model.status.lastError {
            Divider()
            Section("Last error") {
                Text(err)
                    .font(.caption)
                    .foregroundColor(.red)
                    .lineLimit(3)
            }
        }

        Divider()

        // Controls
        Section {
            if model.status.isPaused {
                Button("Resume shipping") { model.resume() }
            } else {
                Button("Pause shipping") { model.pause() }
            }
            Button("Restart now") { model.restart() }
            Button("Refresh") { model.refresh() }
        }

        Divider()

        // Quit
        Button("Quit") {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q")
    }
}

// Helper to avoid compile error with capacity reference
extension ShipperStatus {
    var status_maxParallelAgents: Int {
        capacity?.cpuCount ?? 0
    }
}
