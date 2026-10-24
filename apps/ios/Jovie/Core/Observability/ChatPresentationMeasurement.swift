import Foundation
import Observation

#if DEBUG
/// Test-only DTOs for jovie.interaction-measurement/v1. Never encode clock
/// origins, messages, turn IDs, account identity, URLs or arbitrary context.
struct ChatMeasurementIdentity: Encodable {
  let sourceSHA: String
  let buildNumber: String
  let fixtureId = "native-chat-round-trip-v1"
  let platform = "ios"
  let refreshProfile: RefreshProfile

  struct RefreshProfile: Encodable {
    let maximumFramesPerSecond: Int
    let cadence = "system-variable"
  }

  init?(sourceSHA: String, buildNumber: String, maximumFramesPerSecond: Int) {
    guard sourceSHA.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil,
          buildNumber.range(of: "^[0-9]{1,18}$", options: .regularExpression) != nil,
          (1...240).contains(maximumFramesPerSecond) else { return nil }
    self.sourceSHA = sourceSHA
    self.buildNumber = buildNumber
    refreshProfile = RefreshProfile(maximumFramesPerSecond: maximumFramesPerSecond)
  }
}

struct ChatMeasurementReport: Encodable {
  let schemaVersion = "jovie.interaction-measurement/v1"
  let measurementVersion = "ios-layout-display-link-v1"
  let metadata: ChatMeasurementIdentity
  let sampleCount: Int
  let attemptCount: Int
  let samples: [ChatMeasurementSample]
}

struct ChatMeasurementSample: Encodable {
  enum Outcome: String, Encodable { case complete, cancelled, timedOut, backgrounded, invalidClock }
  enum Unavailable: String, Encodable {
    case noModelUpdate, noPresentation, noHandledInput, insufficientFrames
  }
  let scenarioId = "chat-message-round-trip"
  let runIndex: Int
  let attempt: Int
  let warmup: Bool
  let outcome: Outcome
  let firstFeedbackMs: Double?
  let dataReadyMs: Double?
  let usableStateMs: Double?
  let renderToInteractiveMs: Double?
  let foregroundDurationMs: Double
  let foregroundFrameCount: Int
  let droppedFrameCount: Int?
  let maxFrameIntervalMs: Double?
  let unavailableMetrics: [String: Unavailable]
}

/// One bounded attempt, using a single injected monotonic seconds clock.
/// Repository updates can only set dataReadyMs. A platform adapter supplies
/// presented checkpoints after layout and a subsequent display callback.
@MainActor
@Observable
final class ChatPresentationMeasurement {
  static let maximumAttempts = 20
  static let timeoutSeconds = 10.0
  let identity: ChatMeasurementIdentity
  let now: () -> TimeInterval
  var onStart: () -> Void = {}
  var onStop: () -> Void = {}
  private(set) var samples: [ChatMeasurementSample] = []
  private(set) var generation = 0
  private(set) var inputRevision = 0
  private(set) var isActive = false
  private var runIndex = 0
  private var attempt = 1
  private var warmup = false
  private var start = 0.0
  private var lastNow = 0.0
  private var model: Double?
  private var feedback: Double?
  private var reply: Double?
  private var inputHandled: Double?
  private var interactive: Double?
  private var previousFrame: (timestamp: Double, interval: Double)?
  private var frameCount = 0
  private var droppedFrames = 0
  private var maxInterval: Double?

  init(identity: ChatMeasurementIdentity, now: @escaping () -> TimeInterval) {
    self.identity = identity
    self.now = now
  }

  @discardableResult
  func begin(runIndex: Int, attempt: Int = 1, warmup: Bool = false) -> Int? {
    if isActive { finish(.cancelled) }
    guard samples.count < Self.maximumAttempts, (0..<Self.maximumAttempts).contains(runIndex),
          (1...Self.maximumAttempts).contains(attempt),
          !samples.contains(where: { $0.runIndex == runIndex && $0.attempt == attempt && $0.warmup == warmup })
    else { return nil }
    let instant = now()
    guard instant.isFinite, instant >= 0 else { return nil }
    generation += 1
    self.runIndex = runIndex
    self.attempt = attempt
    self.warmup = warmup
    start = instant
    lastNow = instant
    model = nil
    feedback = nil
    reply = nil
    inputHandled = nil
    interactive = nil
    previousFrame = nil
    frameCount = 0
    droppedFrames = 0
    maxInterval = nil
    isActive = true
    onStart()
    return generation
  }

  func modelUpdated(generation: Int) {
    guard accepts(generation), let instant = instant() else { return }
    if model == nil { model = instant }
  }

  func nextInputHandled() {
    guard isActive, reply != nil, let instant = instant() else { return }
    if inputHandled == nil {
      inputHandled = instant
      inputRevision += 1
    }
  }

  /// timestamp is the LAST displayed frame; targetTimestamp is only used for
  /// its predicted interval, never recorded as a presentation in the future.
  func displayedFrame(generation: Int, timestamp: Double, targetTimestamp: Double,
                      feedbackLaidOutAt: Double? = nil, replyLaidOutAt: Double? = nil,
                      inputLaidOutAt: Double? = nil) {
    guard accepts(generation), let instant = instant() else { return }
    guard timestamp.isFinite, targetTimestamp.isFinite, timestamp <= instant,
          targetTimestamp > timestamp else {
      finish(.invalidClock)
      return
    }
    guard timestamp >= start else { return }
    let interval = targetTimestamp - timestamp
    if let previous = previousFrame {
      let delta = timestamp - previous.timestamp
      guard delta > 0 else { finish(.invalidClock); return }
      maxInterval = max(maxInterval ?? 0, delta)
      // One missing refresh is two intervals even at 120Hz, well below 50ms.
      // Compare against the preceding callback's forecast, not a fixed Hz.
      let missed = max(0, (delta / previous.interval).rounded() - 1)
      droppedFrames += Int(min(missed, 2400))
    }
    previousFrame = (timestamp, interval)
    frameCount += 1
    func presented(_ layout: Double?, after earliest: Double) -> Bool {
      guard let layout else { return false }
      return layout.isFinite && layout >= earliest && layout < timestamp
    }
    if feedback == nil, presented(feedbackLaidOutAt, after: start) { feedback = instant }
    if reply == nil, feedback != nil, let model, presented(replyLaidOutAt, after: model) {
      reply = instant
    }
    if interactive == nil, let reply, let inputHandled,
       presented(inputLaidOutAt, after: max(reply, inputHandled)) {
      interactive = instant
      finish(.complete)
    }
  }

  func cancel(_ outcome: ChatMeasurementSample.Outcome = .cancelled) {
    guard isActive else { return }
    finish(outcome)
  }

  /// A run-loop timer also calls this when no display callbacks are available.
  func checkDeadline() {
    guard isActive else { return }
    _ = instant()
  }

  func report() -> ChatMeasurementReport {
    ChatMeasurementReport(metadata: identity,
                          sampleCount: Set(samples.filter { !$0.warmup }.map(\.runIndex)).count,
                          attemptCount: samples.count, samples: samples)
  }

  func export() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(report())
  }

  private func accepts(_ generation: Int) -> Bool { isActive && self.generation == generation }

  private func instant() -> Double? {
    let value = now()
    guard value.isFinite, value >= lastNow else { finish(.invalidClock); return nil }
    lastNow = value
    guard value - start < Self.timeoutSeconds else { finish(.timedOut); return nil }
    return value
  }

  private func finish(_ outcome: ChatMeasurementSample.Outcome) {
    guard isActive else { return }
    isActive = false
    let end = now()
    let elapsed = end.isFinite && end >= start ? min(end - start, Self.timeoutSeconds) : lastNow - start
    func ms(_ value: Double?) -> Double? { value.map { ($0 - start) * 1000 } }
    var unavailable: [String: ChatMeasurementSample.Unavailable] = [:]
    if model == nil { unavailable["dataReadyMs"] = .noModelUpdate }
    if feedback == nil { unavailable["firstFeedbackMs"] = .noPresentation }
    if reply == nil { unavailable["usableStateMs"] = .noPresentation }
    if interactive == nil { unavailable["renderToInteractiveMs"] = inputHandled == nil ? .noHandledInput : .noPresentation }
    if maxInterval == nil {
      unavailable["droppedFrameCount"] = .insufficientFrames
      unavailable["maxFrameIntervalMs"] = .insufficientFrames
    }
    samples.append(ChatMeasurementSample(
      runIndex: runIndex, attempt: attempt, warmup: warmup, outcome: outcome,
      firstFeedbackMs: ms(feedback), dataReadyMs: ms(model), usableStateMs: ms(reply),
      renderToInteractiveMs: interactive.flatMap { value in reply.map { (value - $0) * 1000 } },
      foregroundDurationMs: max(0, elapsed * 1000), foregroundFrameCount: frameCount,
      droppedFrameCount: maxInterval == nil ? nil : droppedFrames,
      maxFrameIntervalMs: maxInterval.map { $0 * 1000 }, unavailableMetrics: unavailable
    ))
    previousFrame = nil
    onStop()
  }
}
#endif
