import Foundation
import Testing
@testable import Jovie

struct MobileChatContentParserTests {
  @Test func parsesToolCallIntoCardAndSuppressesRawMarkup() {
    let content = """
    Here are some ideas.
    <tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName><artistGenres>pop, electronic</artistGenres><releaseContext>All This Noise EP and remixes</releaseContext></parameters></tool_call>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments.count == 2)
    #expect(segments[0] == .text("Here are some ideas."))

    guard case let .toolCall(model) = segments[1] else {
      Issue.record("Expected tool call segment")
      return
    }

    #expect(model.toolName == "createMerch")
    #expect(model.title == "Creating merch options…")
    #expect(model.body == "Tim White · pop, electronic")
    #expect(model.state == .running)
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == "Here are some ideas.")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).contains("<tool_call>") == false)
  }

  @Test func suppressesIncompleteToolCallWhileStreaming() {
    let content = "Working on it <tool_call><name>createMerch</name><parameters><artistName>Tim"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments.count == 2)
    #expect(segments[0] == .text("Working on it"))
    guard case let .toolCall(model) = segments[1] else {
      Issue.record("Expected partial tool call segment")
      return
    }
    #expect(model.toolName == "createMerch")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: true) == "Working on it")
  }

  @Test func marksFailedToolResultState() {
    let content = """
    <tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName></parameters></tool_call>
    <tool_result><name>createMerch</name><state>failed</state><message>Denied by user</message></tool_result>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    guard case let .toolCall(model) = segments.first else {
      Issue.record("Expected tool call segment")
      return
    }

    #expect(model.state == .failed)
    #expect(model.title == "Couldn't create merch")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).isEmpty)
  }

  @Test func leavesPlainTextUntouched() {
    let content = "Just a normal assistant reply."

    #expect(
      MobileChatContentParser.segments(from: content, isStreaming: false) == [.text(content)]
    )
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == content)
  }
}