import Foundation
import JovieKit
import Testing

struct MobileChatNDJSONReaderTests {
  private let baseURL = URL(string: "https://jov.ie")!

  @Test func publishesBeforeEOFAndAwaitsCallbacksWhilePreservingFinalUTF8() async throws {
    let probe = ReaderProbe()
    let input = readerLine("A") + "\n" + readerLine("Café 🎵")
    let task = Task {
      do {
        let events = try await MobileChatNDJSONReader.read(
          from: ReaderBytes(input, probe: probe), baseURL: baseURL
        ) { await probe.receive($0, holdingFirst: true) }
        await probe.finish()
        return events
      } catch {
        await probe.finish()
        throw error
      }
    }
    // Completion also wakes the driver if parsing fails before any callback.
    await probe.waitForCallbackOrCompletion()
    await probe.release()
    let events = try await task.value // Always release and join before assertions.
    #expect(events == [readerEvent("A"), readerEvent("Café 🎵")])
    #expect(await probe.events == events)
    #expect(await probe.deliveredAtEOF == [false, true])
    #expect(await probe.nextWhileCallbackHeld == false)
    #expect(await probe.nextCalls == input.utf8.count + 1)
  }

  @Test(arguments: [false, true], [false, true])
  func cancellationIsOptionalAtNextByteAndEOF(
    checking: Bool, hasSecondEvent: Bool
  ) async throws {
    let probe = ReaderProbe()
    let input = readerLine("A") + "\n" + (hasSecondEvent ? readerLine("B") : "")
    let task = Task {
      try await MobileChatNDJSONReader.read(
        from: ReaderBytes(input, probe: probe), baseURL: baseURL,
        checkingTaskCancellation: checking
      ) { event in
        await probe.receive(event)
        if event == readerEvent("A") { withUnsafeCurrentTask { $0?.cancel() } }
      }
    }
    let expected = [readerEvent("A")] + (hasSecondEvent ? [readerEvent("B")] : [])
    do {
      let events = try await task.value
      #expect(!checking)
      #expect(events == expected)
    } catch {
      #expect(checking && error is CancellationError)
    }
    #expect(await probe.events == (checking ? [readerEvent("A")] : expected))
  }

  @Test func finalUnterminatedCallbackCancellationDoesNotAddAPostFinishCheck() async throws {
    let probe = ReaderProbe()
    let task = Task {
      try await MobileChatNDJSONReader.read(
        from: ReaderBytes(readerLine("A"), probe: probe), baseURL: baseURL,
        checkingTaskCancellation: true
      ) { event in
        await probe.receive(event)
        withUnsafeCurrentTask { $0?.cancel() }
      }
    }
    let events = try await task.value
    #expect(events == [readerEvent("A")])
    #expect(await probe.events == [readerEvent("A")])
    #expect(await probe.deliveredAtEOF == [true])
  }

  @Test(arguments: [false, true])
  func sourceErrorWinsEvenWhenCallbackCanceledTheReader(cancel: Bool) async {
    let probe = ReaderProbe()
    let task = Task {
      try await MobileChatNDJSONReader.read(
        from: ReaderBytes(readerLine("A") + "\n", probe: probe, failsAtEnd: true),
        baseURL: baseURL, checkingTaskCancellation: true
      ) { event in
        await probe.receive(event)
        if cancel { withUnsafeCurrentTask { $0?.cancel() } }
      }
    }
    do {
      _ = try await task.value
      Issue.record("Expected the original byte-sequence failure")
    } catch {
      #expect(error as? ReaderFailure == .sentinel)
    }
    #expect(await probe.events == [readerEvent("A")])
  }

  @Test(arguments: ["", "\n \r\n{\"type\":\"future.event\"}\n"])
  func emptyAndUnknownOnlyStreamsReturnNoEvents(input: String) async throws {
    let probe = ReaderProbe()
    let events = try await MobileChatNDJSONReader.read(
      from: ReaderBytes(input, probe: probe), baseURL: baseURL
    ) { await probe.receive($0) }
    #expect(events.isEmpty)
    #expect(await probe.events.isEmpty)
  }

  @Test func malformedRecordPreservesExactParserFailure() async {
    do {
      _ = try await MobileChatNDJSONReader.read(
        from: ReaderBytes("{\n", probe: ReaderProbe()), baseURL: baseURL
      )
      Issue.record("Expected the parser's decoding failure")
    } catch {
      #expect(error as? MobileChatClientError == .decodingFailed)
    }
  }
}

private func readerLine(_ text: String) -> String {
  "{\"type\":\"assistant.delta\",\"clientTurnId\":\"ct\",\"text\":\"\(text)\"}"
}

private func readerEvent(_ text: String) -> MobileChatStreamEvent {
  .assistantDelta(clientTurnId: "ct", text: text)
}

private enum ReaderFailure: Error, Equatable { case sentinel }

/// Unlike AsyncStream, this finite source deliberately ignores cancellation.
private struct ReaderBytes: AsyncSequence {
  typealias Element = UInt8
  let bytes: [UInt8]
  let probe: ReaderProbe
  let failsAtEnd: Bool

  init(_ text: String, probe: ReaderProbe, failsAtEnd: Bool = false) {
    bytes = Array(text.utf8)
    self.probe = probe
    self.failsAtEnd = failsAtEnd
  }

  func makeAsyncIterator() -> Iterator {
    Iterator(bytes: bytes, probe: probe, failsAtEnd: failsAtEnd)
  }

  struct Iterator: AsyncIteratorProtocol {
    let bytes: [UInt8]
    let probe: ReaderProbe
    let failsAtEnd: Bool
    var index = 0

    mutating func next() async throws -> UInt8? {
      await probe.requestNext(isEOF: index == bytes.count && !failsAtEnd)
      guard index < bytes.count else {
        if failsAtEnd { throw ReaderFailure.sentinel }
        return nil
      }
      defer { index += 1 }
      return bytes[index]
    }
  }
}

private actor ReaderProbe {
  var events: [MobileChatStreamEvent] = []
  var deliveredAtEOF: [Bool] = []
  var nextCalls = 0
  var nextWhileCallbackHeld = false
  private var eof = false
  private var callbackHeld = false
  private var completed = false
  private var released = false
  private var driver: CheckedContinuation<Void, Never>?
  private var callback: CheckedContinuation<Void, Never>?

  func requestNext(isEOF: Bool) {
    nextCalls += 1
    nextWhileCallbackHeld = nextWhileCallbackHeld || callbackHeld
    eof = isEOF
  }

  func receive(_ event: MobileChatStreamEvent, holdingFirst: Bool = false) async {
    events.append(event)
    deliveredAtEOF.append(eof)
    guard holdingFirst, events.count == 1 else { return }
    callbackHeld = true
    wakeDriver()
    if !released { await withCheckedContinuation { callback = $0 } }
    callbackHeld = false
  }

  func waitForCallbackOrCompletion() async {
    if !events.isEmpty || completed { return }
    await withCheckedContinuation { driver = $0 }
  }

  func release() {
    released = true
    callback?.resume()
    callback = nil
  }

  func finish() {
    completed = true
    wakeDriver()
  }

  private func wakeDriver() {
    driver?.resume()
    driver = nil
  }
}
