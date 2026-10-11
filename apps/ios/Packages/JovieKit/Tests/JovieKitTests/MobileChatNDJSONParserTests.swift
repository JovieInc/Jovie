import Foundation
import JovieKit
import Testing

struct MobileChatNDJSONParserTests {
  private let baseURL = URL(string: "https://jov.ie")!

  @Test func decodesCurrentWireEventsWithoutChangingTheirPayloads() throws {
    let ndjson = """
    {"type":"turn.reserved","conversationId":"c","turnId":"t","clientTurnId":"ct"}
    {"type":"turn.state","clientTurnId":"ct","state":"running","eveWorkId":"work"}
    {"type":"assistant.delta","clientTurnId":"ct","text":"Hello"}
    {"type":"assistant.completed","clientTurnId":"ct","conversationId":"c","turnId":"t","text":"Hello!"}
    {"type":"web.handoff","clientTurnId":"ct","conversationId":"c","url":"/settings","summary":"Continue"}
    {"type":"error","errorCode":"RATE_LIMITED","message":"Slow down"}
    {"type":"error"}
    """
    var leftover = Data()
    let events = try MobileChatNDJSONParser.consume(
      chunk: Data(ndjson.utf8), leftover: &leftover, baseURL: baseURL
    ) + MobileChatNDJSONParser.finish(leftover: &leftover, baseURL: baseURL)

    #expect(events == [
      .turnReserved(conversationId: "c", turnId: "t", clientTurnId: "ct"),
      .turnState(clientTurnId: "ct", state: "running", eveWorkId: "work"),
      .assistantDelta(clientTurnId: "ct", text: "Hello"),
      .assistantCompleted(clientTurnId: "ct", conversationId: "c", turnId: "t", text: "Hello!"),
      .webHandoff(
        clientTurnId: "ct", conversationId: "c",
        url: URL(string: "https://jov.ie/settings")!, summary: "Continue"
      ),
      .error(code: "RATE_LIMITED", message: "Slow down"),
      .error(code: "UNKNOWN", message: "Native chat failed."),
    ])
    #expect(leftover.isEmpty)
    #expect(try MobileChatNDJSONParser.finish(leftover: &leftover, baseURL: baseURL).isEmpty)
  }

  @Test func preservesUTF8AcrossEveryPossibleChunkBoundary() throws {
    let data = Data("{\"type\":\"assistant.delta\",\"clientTurnId\":\"ct\",\"text\":\"Café 🎵\"}\n".utf8)
    for boundary in 1..<data.count {
      var leftover = Data()
      let first = try MobileChatNDJSONParser.consume(
        chunk: data.subdata(in: 0..<boundary), leftover: &leftover, baseURL: baseURL
      )
      #expect(first.isEmpty)
      let last = try MobileChatNDJSONParser.consume(
        chunk: data.subdata(in: boundary..<data.count), leftover: &leftover, baseURL: baseURL
      )
      #expect(last == [.assistantDelta(clientTurnId: "ct", text: "Café 🎵")])
      #expect(leftover.isEmpty)
    }
  }

  @Test(arguments: ["turn.reserved", "turn.state", "assistant.delta", "assistant.completed", "web.handoff"])
  func rejectsMissingRequiredEventFields(type: String) {
    #expect(throws: MobileChatClientError.decodingFailed) {
      try MobileChatNDJSONParser.parseEvent(from: "{\"type\":\"\(type)\"}", baseURL: baseURL)
    }
  }

  @Test(arguments: ["{", "[]", "{}", "{\"type\":12}"])
  func rejectsMalformedWireRecords(line: String) {
    #expect(throws: MobileChatClientError.decodingFailed) {
      try MobileChatNDJSONParser.parseEvent(from: line, baseURL: baseURL)
    }
  }

  @Test func rejectsInvalidUTF8WhenTheLineCompletes() throws {
    var leftover = Data()
    #expect(try MobileChatNDJSONParser.consume(
      chunk: Data([0xff]), leftover: &leftover, baseURL: baseURL
    ).isEmpty)
    #expect(throws: MobileChatClientError.decodingFailed) {
      try MobileChatNDJSONParser.finish(leftover: &leftover, baseURL: baseURL)
    }
  }

  @Test func skipsBlankLinesAndUnknownEventsForForwardCompatibility() throws {
    for line in ["", " \r\n", "{\"type\":\"future.event\",\"payload\":{}}"] {
      #expect(try MobileChatNDJSONParser.parseEvent(from: line, baseURL: baseURL) == nil)
    }
    #expect(try MobileChatNDJSONParser.parseEvent(
      from: "{\"type\":\"turn.state\",\"clientTurnId\":\"ct\",\"state\":\"queued\"}", baseURL: baseURL
    ) == .turnState(clientTurnId: "ct", state: "queued", eveWorkId: nil))
  }

  @Test func preservesPublicClientErrorDescriptions() {
    #expect(MobileChatClientError.decodingFailed.errorDescription == "The chat response could not be decoded.")
    #expect(MobileChatClientError.invalidResponse.errorDescription == "The chat server returned an invalid response.")
    #expect(MobileChatClientError.requestFailed(statusCode: 429).errorDescription == "The chat request failed with status code 429.")
    #expect(MobileChatClientError.transportFailed(code: -1009).errorDescription == "The chat network request failed with code -1009.")
    #expect(MobileChatClientError.streamFailed(message: "Ended").errorDescription == "Ended")
  }

  @Test func incrementalParserEmitsEventsAsCompleteLinesArrive() throws {
    let baseURL = URL(string: "https://jov.ie")!
    let ndjson = """
    {"type":"turn.reserved","conversationId":"conv_1","turnId":"turn_1","clientTurnId":"client_turn_1"}
    {"type":"assistant.delta","clientTurnId":"client_turn_1","text":"Hel"}
    {"type":"ignored.event","clientTurnId":"client_turn_1"}
    {"type":"assistant.completed","clientTurnId":"client_turn_1","conversationId":"conv_1","turnId":"turn_1","text":"Hello"}
    """
    let data = Data(ndjson.utf8)
    let firstNewline = try #require(data.firstIndex(of: UInt8(ascii: "\n")))
    let firstChunk = data[...firstNewline]
    let splitIndex = data.index(firstNewline, offsetBy: 20, limitedBy: data.endIndex) ?? data.endIndex
    let secondChunk = data[data.index(after: firstNewline)..<splitIndex]
    let remainder = data[splitIndex...]

    var leftover = Data()
    let firstEvents = try MobileChatNDJSONParser.consume(
      chunk: Data(firstChunk),
      leftover: &leftover,
      baseURL: baseURL
    )
    #expect(firstEvents == [
      .turnReserved(conversationId: "conv_1", turnId: "turn_1", clientTurnId: "client_turn_1"),
    ])
    #expect(leftover.isEmpty)

    let midEvents = try MobileChatNDJSONParser.consume(
      chunk: Data(secondChunk),
      leftover: &leftover,
      baseURL: baseURL
    )
    #expect(midEvents.isEmpty)
    #expect(!leftover.isEmpty)

    let restEvents = try MobileChatNDJSONParser.consume(
      chunk: Data(remainder),
      leftover: &leftover,
      baseURL: baseURL
    )
    let trailing = try MobileChatNDJSONParser.finish(leftover: &leftover, baseURL: baseURL)
    #expect(restEvents + trailing == [
      .assistantDelta(clientTurnId: "client_turn_1", text: "Hel"),
      .assistantCompleted(
        clientTurnId: "client_turn_1",
        conversationId: "conv_1",
        turnId: "turn_1",
        text: "Hello"
      ),
    ])
    #expect(leftover.isEmpty)
  }
}
