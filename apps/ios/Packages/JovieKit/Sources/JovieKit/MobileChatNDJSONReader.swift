import Foundation

/// Reads NDJSON bytes and awaits each event's delivery before reading more bytes.
public enum MobileChatNDJSONReader {
  public static func read<Bytes: AsyncSequence>(
    from bytes: Bytes,
    baseURL: URL,
    checkingTaskCancellation: Bool = false,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)? = nil
  ) async throws -> [MobileChatStreamEvent] where Bytes.Element == UInt8 {
    var leftover = Data()
    var events: [MobileChatStreamEvent] = []
    var batch = Data()
    batch.reserveCapacity(256)

    for try await byte in bytes {
      if checkingTaskCancellation { try Task.checkCancellation() }
      batch.append(byte)
      guard byte == UInt8(ascii: "\n") else { continue }
      try await publish(
        MobileChatNDJSONParser.consume(
          chunk: batch,
          leftover: &leftover,
          baseURL: baseURL
        ),
        into: &events,
        onEvent: onEvent
      )
      batch.removeAll(keepingCapacity: true)
    }

    if checkingTaskCancellation { try Task.checkCancellation() }
    if !batch.isEmpty {
      try await publish(
        MobileChatNDJSONParser.consume(
          chunk: batch,
          leftover: &leftover,
          baseURL: baseURL
        ),
        into: &events,
        onEvent: onEvent
      )
    }

    try await publish(
      MobileChatNDJSONParser.finish(leftover: &leftover, baseURL: baseURL),
      into: &events,
      onEvent: onEvent
    )
    return events
  }

  private static func publish(
    _ parsed: [MobileChatStreamEvent],
    into events: inout [MobileChatStreamEvent],
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async {
    for event in parsed {
      events.append(event)
      if let onEvent {
        await onEvent(event)
      }
    }
  }
}
