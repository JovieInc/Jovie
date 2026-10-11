import Foundation

/// Batches raw NDJSON stream events into bounded-rate timeline mutations.
///
/// `MobileChatClient` publishes one event per newline, so without this every
/// server chunk would mutate `ChatRepository.timeline` and re-parse the
/// assistant row on the main actor. Deltas accumulate for `window` and flush
/// together; any lifecycle event (reserved / completed / handoff / error)
/// flushes immediately so state transitions are never delayed. Mirrors the
/// web composer's `experimental_throttle` pacing (JOV-5874).
@MainActor
public final class MobileChatStreamCoalescer {
  /// ~30 paints/s — smooth on device, well under the parse budget per flush.
  public static let defaultWindow: Duration = .milliseconds(33)

  private let window: Duration
  private let sink: ([MobileChatStreamEvent]) -> Void
  private var pending: [MobileChatStreamEvent] = []
  private var flushTask: Task<Void, Never>?
  /// Number of batches delivered to `sink`. Exposed for tests.
  private(set) var flushCount = 0

  public init(
    window: Duration = MobileChatStreamCoalescer.defaultWindow,
    sink: @escaping ([MobileChatStreamEvent]) -> Void
  ) {
    self.window = window
    self.sink = sink
  }

  public func ingest(_ event: MobileChatStreamEvent) {
    pending.append(event)
    guard case .assistantDelta = event else {
      flush()
      return
    }
    guard flushTask == nil else { return }
    let window = self.window
    flushTask = Task { [weak self] in
      try? await Task.sleep(for: window)
      guard !Task.isCancelled, let self else { return }
      self.flush()
    }
  }

  /// Delivers everything buffered so far. Safe to call repeatedly; a no-op
  /// when nothing is pending.
  public func flush() {
    flushTask?.cancel()
    flushTask = nil
    guard !pending.isEmpty else { return }
    let batch = pending
    pending.removeAll(keepingCapacity: true)
    flushCount += 1
    sink(batch)
  }
}
