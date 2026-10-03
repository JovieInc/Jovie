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
    contents.append(.resolve(arguments: ["JovieMac", "--jovie-development-composer"]))
    #endif
    for content in contents {
      let view = NSHostingView(rootView: MacDevelopmentView(content: content))
      view.frame = NSRect(x: 0, y: 0, width: 640, height: 480)
      view.layoutSubtreeIfNeeded()
      XCTAssertGreaterThanOrEqual(view.fittingSize.width, 420)
      XCTAssertGreaterThanOrEqual(view.fittingSize.height, 320)
    }
  }

  func testComposerRequiresTheExactDebugOptIn() {
    XCTAssertEqual(
      MacDevelopmentContent.resolve(arguments: ["JovieMac", "--jovie-development-composer=true"]), .unavailable
    )
    let content = MacDevelopmentContent.resolve(arguments: ["JovieMac", "--jovie-development-composer"])
    #if DEBUG
    XCTAssertEqual(content, .localDraft)
    #else
    XCTAssertEqual(content, .unavailable)
    #endif
  }

  func testNativeTypingPasteUndoAndEqualUpdatesPreserveTheEditor() throws {
    let h = ComposerHarness()
    defer { h.close() }
    let editor = try h.editor()
    let storage = editor.textStorage
    let scroll = try XCTUnwrap(editor.enclosingScrollView)
    XCTAssertGreaterThan(scroll.contentSize.height, 0)
    XCTAssertGreaterThanOrEqual(editor.frame.height, scroll.contentSize.height)
    XCTAssertGreaterThanOrEqual(editor.frame.width, scroll.contentSize.width)
    XCTAssertTrue(h.window.makeFirstResponder(editor))
    let pasteboard = NSPasteboard.withUniqueName()
    defer { pasteboard.releaseGlobally() }
    XCTAssertTrue(pasteboard.setString("🚀\né", forType: .string))
    h.edit(editor) {
      editor.insertText("A", replacementRange: NSRange(location: NSNotFound, length: 0))
      XCTAssertTrue(editor.readSelection(from: pasteboard))
    }
    XCTAssertEqual(editor.string, "A🚀\né")
    XCTAssertEqual(h.draft.text, editor.string)
    let selection = (editor.string as NSString).range(of: "🚀")
    editor.setSelectedRange(selection)
    XCTAssertEqual(editor.accessibilitySelectedTextRange(), selection)
    for index in 0..<20 {
      h.resize(width: index.isMultiple(of: 2) ? 360 : 420, height: index.isMultiple(of: 2) ? 160 : 180)
      h.render()
    }
    XCTAssertTrue(try h.editor() === editor)
    XCTAssertTrue(editor.textStorage === storage)
    XCTAssertGreaterThanOrEqual(editor.frame.height, scroll.contentSize.height)
    XCTAssertGreaterThanOrEqual(editor.frame.width, scroll.contentSize.width)
    XCTAssertEqual(editor.selectedRange(), selection)
    XCTAssertTrue(h.window.firstResponder === editor)
    let undo = try XCTUnwrap(editor.undoManager)
    XCTAssertTrue(undo === editor.draftUndoManager)
    XCTAssertTrue(undo.canUndo)
    undo.undo()
    XCTAssertEqual(editor.string, "")
    XCTAssertEqual(h.draft.text, "")
    XCTAssertTrue(undo.canRedo)
    h.render()
    XCTAssertEqual(editor.string, "")
    XCTAssertEqual(h.draft.text, "")
    XCTAssertTrue(undo.canRedo)
    undo.redo()
    XCTAssertEqual(editor.string, "A🚀\né")
    XCTAssertEqual(h.draft.text, "A🚀\né")
    h.render()
    XCTAssertEqual(editor.string, "A🚀\né")
    XCTAssertEqual(h.draft.text, "A🚀\né")
    XCTAssertTrue(editor.isEditable && editor.isSelectable)
    XCTAssertFalse(editor.isRichText)
    XCTAssertEqual(editor.accessibilityRole(), .textArea)
    XCTAssertEqual(editor.accessibilityLabel(), "Local draft")
    XCTAssertEqual(editor.accessibilityIdentifier(), "mac-local-draft-editor")
    XCTAssertEqual(editor.accessibilityValue() as? String, h.draft.text)
  }

  func testCompositionWinsOverExternalReplacementAndConvergesOnCommitOrUnmark() throws {
    for commitsNewText in [false, true] {
      let h = ComposerHarness()
      defer { h.close() }
      let editor = try h.editor()
      XCTAssertTrue(h.window.makeFirstResponder(editor))
      editor.setMarkedText("かな", selectedRange: NSRange(location: 2, length: 0),
                           replacementRange: NSRange(location: NSNotFound, length: 0))
      let nativeText = editor.string
      let markedRange = editor.markedRange()
      XCTAssertTrue(editor.hasMarkedText())
      h.draft.text = "Conflicting external reset"
      h.render()
      XCTAssertEqual(editor.string, nativeText)
      XCTAssertEqual(editor.markedRange(), markedRange)
      if commitsNewText {
        editor.insertText("仮名", replacementRange: NSRange(location: NSNotFound, length: 0))
      } else {
        editor.unmarkText()
      }
      XCTAssertFalse(editor.hasMarkedText())
      XCTAssertEqual(editor.string, commitsNewText ? "仮名" : nativeText)
      XCTAssertEqual(h.draft.text, editor.string)
      h.render()
      XCTAssertEqual(editor.string, commitsNewText ? "仮名" : nativeText)
    }
  }

  func testExplicitFocusWaitsForAttachmentAndIsConsumedOnce() throws {
    let request = UUID()
    let h = ComposerHarness(focusRequest: request, attach: false)
    defer { h.close() }
    let editor = try h.editor()
    XCTAssertNil(editor.window)
    h.attach()
    XCTAssertTrue(h.window.firstResponder === editor)
    XCTAssertTrue(h.window.makeFirstResponder(h.otherResponder))
    for _ in 0..<3 { h.render() }
    XCTAssertTrue(h.window.firstResponder === h.otherResponder)
    h.focusRequest = UUID()
    h.render()
    XCTAssertTrue(h.window.firstResponder === editor)
    XCTAssertTrue(h.window.makeFirstResponder(h.otherResponder))
    h.focusRequest = nil
    h.render()
    XCTAssertTrue(h.window.firstResponder === h.otherResponder)
  }

  func testExternalReplacementClampsUTF16SelectionAndClearsOnlyEditorUndo() throws {
    let h = ComposerHarness()
    defer { h.close() }
    let editor = try h.editor()
    h.edit(editor) {
      editor.insertText("A🚀é", replacementRange: NSRange(location: NSNotFound, length: 0))
    }
    editor.setSelectedRange((editor.string as NSString).range(of: "🚀"))
    let otherUndo = try XCTUnwrap(h.window.undoManager)
    XCTAssertFalse(otherUndo === editor.undoManager)
    otherUndo.groupsByEvent = false
    otherUndo.beginUndoGrouping()
    otherUndo.registerUndo(withTarget: h.draft) { $0.text = "Other control undo" }
    otherUndo.endUndoGrouping()
    XCTAssertTrue(try XCTUnwrap(editor.undoManager).canUndo)
    h.draft.text = "X"
    h.render()
    XCTAssertEqual(editor.string, "X")
    XCTAssertEqual(editor.selectedRange(), NSRange(location: 1, length: 0))
    XCTAssertFalse(try XCTUnwrap(editor.undoManager).canUndo)
    XCTAssertTrue(otherUndo.canUndo)
    otherUndo.undo()
    XCTAssertEqual(h.draft.text, "Other control undo")
  }

  func testReplacementBindingAndDismantleDoNotPublishToAnOldOwner() throws {
    let h = ComposerHarness()
    defer { h.close() }
    let editor = try h.editor()
    let oldOwner = h.draft
    editor.setMarkedText("かな", selectedRange: NSRange(location: 2, length: 0),
                         replacementRange: NSRange(location: NSNotFound, length: 0))
    let oldValue = oldOwner.text
    h.draft = ComposerDraft("Replacement owner")
    h.render()
    XCTAssertTrue(try h.editor() === editor)
    editor.unmarkText()
    XCTAssertEqual(h.draft.text, editor.string)
    XCTAssertEqual(oldOwner.text, oldValue)
    let coordinator = try XCTUnwrap(editor.delegate as? MacComposerTextView.Coordinator)
    let scroll = try XCTUnwrap(editor.enclosingScrollView)
    let windowUndo = try XCTUnwrap(h.window.undoManager)
    windowUndo.groupsByEvent = false
    windowUndo.beginUndoGrouping()
    windowUndo.registerUndo(withTarget: oldOwner) { $0.text = "Other control undo" }
    windowUndo.endUndoGrouping()
    MacComposerTextView.dismantleNSView(scroll, coordinator: coordinator)
    XCTAssertFalse(editor.draftUndoManager.canUndo)
    XCTAssertTrue(windowUndo.canUndo)
    XCTAssertNil(editor.delegate)
    XCTAssertNil(editor.onCompositionEnded)
    XCTAssertNil(editor.onWindowChanged)
    XCTAssertTrue(h.window.makeFirstResponder(h.otherResponder))
    let disconnectedValue = h.draft.text
    h.edit(editor) {
      editor.insertText("!", replacementRange: NSRange(location: NSNotFound, length: 0))
    }
    coordinator.publish(editor)
    coordinator.applyFocus(to: editor)
    XCTAssertEqual(h.draft.text, disconnectedValue)
    XCTAssertEqual(oldOwner.text, oldValue)
    XCTAssertTrue(h.window.firstResponder === h.otherResponder)
  }
}

@MainActor
private final class ComposerDraft {
  var text: String
  init(_ text: String = "") { self.text = text }
  var binding: Binding<String> { Binding(get: { self.text }, set: { self.text = $0 }) }
}

@MainActor
private final class ComposerHarness {
  var draft: ComposerDraft
  var focusRequest: UUID?
  let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 260),
                        styleMask: [.titled], backing: .buffered, defer: false)
  let otherResponder = NSTextView(frame: NSRect(x: 0, y: 200, width: 420, height: 60))
  private let container = NSView(frame: NSRect(x: 0, y: 0, width: 420, height: 260))
  private let host: NSHostingView<MacComposerTextView>

  init(focusRequest: UUID? = nil, attach: Bool = true) {
    let draft = ComposerDraft()
    self.draft = draft
    self.focusRequest = focusRequest
    host = NSHostingView(rootView: MacComposerTextView(text: draft.binding, focusRequest: focusRequest))
    window.isReleasedWhenClosed = false
    host.frame = NSRect(x: 0, y: 0, width: 420, height: 180)
    container.addSubview(host)
    container.addSubview(otherResponder)
    host.layoutSubtreeIfNeeded()
    if attach { self.attach() }
  }

  func attach() {
    window.contentView = container
    container.layoutSubtreeIfNeeded()
  }

  func render() {
    host.rootView = MacComposerTextView(text: draft.binding, focusRequest: focusRequest)
    host.layoutSubtreeIfNeeded()
  }

  func resize(width: CGFloat, height: CGFloat) {
    host.setFrameSize(NSSize(width: width, height: height))
    host.layoutSubtreeIfNeeded()
  }

  func editor() throws -> MacComposerEditor {
    func find(_ view: NSView) -> MacComposerEditor? {
      if let editor = view as? MacComposerEditor { return editor }
      return view.subviews.lazy.compactMap { find($0) }.first
    }
    return try XCTUnwrap(find(host))
  }

  func edit(_ editor: MacComposerEditor, _ operation: () -> Void) {
    editor.breakUndoCoalescing()
    editor.undoManager?.groupsByEvent = false
    editor.undoManager?.beginUndoGrouping()
    operation()
    editor.undoManager?.endUndoGrouping()
    editor.breakUndoCoalescing()
  }

  func close() {
    window.makeFirstResponder(nil)
    window.contentView = nil
    window.close()
  }
}
