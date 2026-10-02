import Foundation
import Testing
@testable import JovieKit

@MainActor
struct MobileChatStreamCoalescerTests {
  @Test(arguments: [
    MobileChatStreamEvent.turnReserved(conversationId: "conv", turnId: "t1", clientTurnId: "turn"),
    .turnState(clientTurnId: "turn", state: "running", eveWorkId: "work"),
    .assistantCompleted(clientTurnId: "turn", conversationId: "conv", turnId: "t1", text: "AB"),
    .webHandoff(
      clientTurnId: "turn", conversationId: "conv",
      url: URL(string: "https://jov.ie/app/chat/conv")!, summary: "Continue"
    ),
    .error(code: "FAILED", message: "Retry"),
  ])
  func streamCoalescerBuffersDeltasAndFlushesLifecycleEventsImmediately(
    lifecycleEvent: MobileChatStreamEvent
  ) {
    let recorder = StreamBatchRecorder()
    let coalescer = MobileChatStreamCoalescer(window: .seconds(60)) { batch in
      recorder.batches.append(batch)
    }

    coalescer.ingest(.assistantDelta(clientTurnId: "turn", text: "A"))
    coalescer.ingest(.assistantDelta(clientTurnId: "turn", text: "B"))
    #expect(recorder.batches.isEmpty)

    coalescer.ingest(lifecycleEvent)
    #expect(recorder.batches == [[
      .assistantDelta(clientTurnId: "turn", text: "A"),
      .assistantDelta(clientTurnId: "turn", text: "B"),
      lifecycleEvent,
    ]])

    coalescer.flush()
    #expect(recorder.batches.count == 1)
    #expect(coalescer.flushCount == 1)
  }

  @Test func manualFlushKeepsSeparateBurstsOrderedAndDoesNotRedeliverThem() {
    let recorder = StreamBatchRecorder()
    let coalescer = MobileChatStreamCoalescer(window: .seconds(60)) { batch in
      recorder.batches.append(batch)
    }
    let first = [
      MobileChatStreamEvent.assistantDelta(clientTurnId: "turn", text: "A"),
      .assistantDelta(clientTurnId: "turn", text: "B"),
    ]
    let second = [
      MobileChatStreamEvent.assistantDelta(clientTurnId: "turn", text: "C"),
      .assistantDelta(clientTurnId: "turn", text: "D"),
    ]

    coalescer.flush()
    #expect(coalescer.flushCount == 0)
    for event in first { coalescer.ingest(event) }
    coalescer.flush()
    coalescer.flush()
    #expect(recorder.batches == [first])

    for event in second { coalescer.ingest(event) }
    #expect(recorder.batches == [first])
    coalescer.flush()
    coalescer.flush()
    #expect(recorder.batches == [first, second])
    #expect(coalescer.flushCount == 2)
  }

  @Test func streamCoalescerFlushesBufferedDeltasAfterWindowElapses() async {
    let recorder = StreamBatchRecorder()
    let coalescer = MobileChatStreamCoalescer(window: .milliseconds(5)) { batch in
      recorder.batches.append(batch)
    }

    coalescer.ingest(.assistantDelta(clientTurnId: "turn", text: "A"))
    coalescer.ingest(.assistantDelta(clientTurnId: "turn", text: "B"))
    coalescer.ingest(.assistantDelta(clientTurnId: "turn", text: "C"))

    let deadline = ContinuousClock.now.advanced(by: .seconds(2))
    while recorder.batches.isEmpty, ContinuousClock.now < deadline {
      await Task.yield()
      try? await Task.sleep(for: .milliseconds(5))
    }

    #expect(recorder.batches.count == 1)
    #expect(recorder.batches.first?.count == 3)
  }
}

/// Collects coalescer batches for assertions (JOV-5874).
@MainActor
private final class StreamBatchRecorder {
  var batches: [[MobileChatStreamEvent]] = []
}
