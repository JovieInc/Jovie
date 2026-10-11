import Foundation

public enum MobileChatNDJSONParser {
  public static func parseEvent(from line: String, baseURL: URL) throws -> MobileChatStreamEvent? {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    guard let lineData = trimmed.data(using: .utf8) else {
      throw MobileChatClientError.decodingFailed
    }

    let jsonObject: Any
    do {
      jsonObject = try JSONSerialization.jsonObject(with: lineData)
    } catch {
      throw MobileChatClientError.decodingFailed
    }

    guard let json = jsonObject as? [String: Any],
          let type = json["type"] as? String else {
      throw MobileChatClientError.decodingFailed
    }

    switch type {
    case "turn.reserved":
      guard
        let conversationId = json["conversationId"] as? String,
        let turnId = json["turnId"] as? String,
        let clientTurnId = json["clientTurnId"] as? String
      else { throw MobileChatClientError.decodingFailed }
      return .turnReserved(
        conversationId: conversationId,
        turnId: turnId,
        clientTurnId: clientTurnId
      )

    case "turn.state":
      guard
        let clientTurnId = json["clientTurnId"] as? String,
        let state = json["state"] as? String
      else { throw MobileChatClientError.decodingFailed }
      return .turnState(
        clientTurnId: clientTurnId,
        state: state,
        eveWorkId: json["eveWorkId"] as? String
      )

    case "assistant.delta":
      guard
        let clientTurnId = json["clientTurnId"] as? String,
        let text = json["text"] as? String
      else { throw MobileChatClientError.decodingFailed }
      return .assistantDelta(clientTurnId: clientTurnId, text: text)

    case "assistant.completed":
      guard
        let clientTurnId = json["clientTurnId"] as? String,
        let conversationId = json["conversationId"] as? String,
        let turnId = json["turnId"] as? String,
        let text = json["text"] as? String
      else { throw MobileChatClientError.decodingFailed }
      return .assistantCompleted(
        clientTurnId: clientTurnId,
        conversationId: conversationId,
        turnId: turnId,
        text: text
      )

    case "web.handoff":
      guard
        let clientTurnId = json["clientTurnId"] as? String,
        let conversationId = json["conversationId"] as? String,
        let urlString = json["url"] as? String,
        let summary = json["summary"] as? String,
        let url = URL(string: urlString, relativeTo: baseURL)?.absoluteURL
      else { throw MobileChatClientError.decodingFailed }
      return .webHandoff(
        clientTurnId: clientTurnId,
        conversationId: conversationId,
        url: url,
        summary: summary
      )

    case "error":
      let code = json["errorCode"] as? String ?? "UNKNOWN"
      let message = json["message"] as? String ?? "Native chat failed."
      return .error(code: code, message: message)

    default:
      return nil
    }
  }

  /// Emits events for every complete NDJSON line in `chunk`, leaving a partial
  /// trailing line in `leftover` so callers can paint before the body finishes.
  public static func consume(
    chunk: Data,
    leftover: inout Data,
    baseURL: URL
  ) throws -> [MobileChatStreamEvent] {
    leftover.append(chunk)
    var events: [MobileChatStreamEvent] = []

    while let newline = leftover.firstIndex(of: UInt8(ascii: "\n")) {
      let lineData = leftover[leftover.startIndex..<newline]
      leftover.removeSubrange(leftover.startIndex...newline)
      guard let line = String(data: Data(lineData), encoding: .utf8) else {
        throw MobileChatClientError.decodingFailed
      }
      if let event = try parseEvent(from: line, baseURL: baseURL) {
        events.append(event)
      }
    }

    return events
  }

  public static func finish(leftover: inout Data, baseURL: URL) throws -> [MobileChatStreamEvent] {
    guard !leftover.isEmpty else { return [] }
    return try consume(
      chunk: Data([UInt8(ascii: "\n")]),
      leftover: &leftover,
      baseURL: baseURL
    )
  }
}
