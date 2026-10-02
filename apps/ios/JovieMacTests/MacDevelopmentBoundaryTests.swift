import AppKit
import CoreText
import JovieKit
import SwiftUI
import XCTest
@testable import JovieMac

@MainActor
final class MacDevelopmentBoundaryTests: XCTestCase {
  func testDefaultAndUnknownArgumentsRemainUnavailable() {
    XCTAssertEqual(MacDevelopmentContent.resolve(arguments: ["JovieMac"]), .unavailable)
    XCTAssertEqual(
      MacDevelopmentContent.resolve(arguments: ["JovieMac", "--sign-in", "--chat"]),
      .unavailable
    )
  }

  func testFixtureRequiresTheExactExplicitArgument() {
    XCTAssertEqual(
      MacDevelopmentContent.resolve(arguments: ["JovieMac", "--jovie-development-fixture=true"]),
      .unavailable
    )
    let content = MacDevelopmentContent.resolve(arguments: ["JovieMac", "--jovie-development-fixture"])
    #if DEBUG
    guard case let .fixture(conversation, messages) = content else {
      return XCTFail("Debug must accept the explicit development fixture")
    }
    XCTAssertEqual(conversation.id, "development-conversation")
    XCTAssertEqual(conversation.latestTurnStatus, "completed")
    XCTAssertEqual(messages.map(\.id), ["development-message"])
    XCTAssertEqual(messages.first?.requiresWebHandoff, false)
    #else
    XCTAssertEqual(content, .unavailable, "Release cannot construct development fixtures")
    #endif
  }

  #if DEBUG
  func testFixtureUsesThePublicSharedWireContract() throws {
    guard case let .fixture(conversation, messages) = MacDevelopmentContent.resolve(
      arguments: ["JovieMac", "--jovie-development-fixture"]
    ) else { return XCTFail("Missing explicit fixture") }
    let encoded = try JSONEncoder().encode(MobileConversationListResponse(conversations: [conversation]))
    let decoded = try JSONDecoder().decode(MobileConversationListResponse.self, from: encoded)
    XCTAssertEqual(decoded.conversations, [conversation])
    let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(messages)) as? [[String: Any]])
    XCTAssertEqual(wire.first?["content"] as? String, messages.first?.content)
    XCTAssertEqual(wire.first?["requiresWebHandoff"] as? Bool, false)
    XCTAssertNil(wire.first?["turnId"])
  }
  #endif

  func testAppBundleRegistersTheSharedInterFont() throws {
    XCTAssertEqual(Bundle.main.bundleIdentifier, "ie.jov.JovieMac.Development")
    let bundledFont = try XCTUnwrap(Bundle.main.url(forResource: "Inter-Variable", withExtension: "ttf"))
    let font = try XCTUnwrap(NSFont(name: "Inter Variable", size: 16) ?? NSFont(name: "Inter", size: 16))
    let resolvedURL = try XCTUnwrap(CTFontCopyAttribute(font as CTFont, kCTFontURLAttribute) as? URL)
    XCTAssertEqual(resolvedURL.resolvingSymlinksInPath(), bundledFont.resolvingSymlinksInPath())
  }

  func testNativeViewHasAUsableFrameInEveryCompiledMode() {
    var contents: [MacDevelopmentContent] = [.unavailable]
    #if DEBUG
    contents.append(.resolve(arguments: ["JovieMac", "--jovie-development-fixture"]))
    #endif
    for content in contents {
      let view = NSHostingView(rootView: MacDevelopmentView(content: content))
      view.frame = NSRect(x: 0, y: 0, width: 640, height: 480)
      view.layoutSubtreeIfNeeded()
      XCTAssertGreaterThanOrEqual(view.fittingSize.width, 420)
      XCTAssertGreaterThanOrEqual(view.fittingSize.height, 320)
    }
  }
}
