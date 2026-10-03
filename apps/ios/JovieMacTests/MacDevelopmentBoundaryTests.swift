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

@MainActor
extension MacDevelopmentBoundaryTests {
  func testSharedFactoryBootstrapsPersistedCustomerWindow() async throws {
    let suite = "MacChatState.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let snapshot = macChatSnapshot(count: 45)
    await ChatCache(defaults: defaults).store(snapshot, for: "customer", workspace: .jovie)
    let freshCache = ChatCache(defaults: defaults)
    let decoded = await freshCache.load(for: "customer", workspace: .jovie)
    XCTAssertEqual(decoded, snapshot)
    let identity = NativeChatIdentity(userID: "customer", ownership: nil, workspace: .jovie)
    var expirations = 0
    let repository = NativeChatRepositoryFactory.make(
      identity: identity, apiBaseURL: try XCTUnwrap(URL(string: "https://api.example.invalid")),
      webBaseURL: try XCTUnwrap(URL(string: "https://web.example.invalid")), cache: freshCache,
      onSessionExpired: { _ in expirations += 1 }
    )
    XCTAssertEqual(repository.identity, identity)
    XCTAssertTrue(repository.timeline.isEmpty)
    XCTAssertEqual(expirations, 0)
    await repository.bootstrap() // Customer hydration never dispatches a request.
    XCTAssertEqual(repository.conversations, snapshot.conversations)
    XCTAssertEqual(repository.activeConversationID, "thread")
    XCTAssertEqual(repository.timeline.map(\.id), (5..<45).map { "message-\($0)" })
    XCTAssertEqual(repository.timeline.first?.createdAt, "2026-01-01T00:00:05Z")
    XCTAssertTrue(repository.hasMoreOlder)
    XCTAssertEqual(repository.timeline.last?.turnId, "turn-44")
    XCTAssertEqual(repository.timeline.last?.requiresWebHandoff, true)
    XCTAssertEqual(repository.timeline.last?.handoffURL?.absoluteString, "https://web.example.invalid/app/chat/thread")
    XCTAssertFalse(repository.sessionExpired)
    XCTAssertEqual(expirations, 0)
  }

  func testSharedCacheIsolatesUsersWorkspacesRemovalAndLegacyFields() async throws {
    let suite = "MacChatState.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let cache = ChatCache(defaults: defaults)
    let customer = macChatSnapshot(count: 1), operatorSnapshot = macChatSnapshot(count: 2)
    let secondUser = macChatSnapshot(count: 3)
    await cache.store(customer, for: "first", workspace: .jovie)
    await cache.store(operatorSnapshot, for: "first", workspace: .ovie)
    await cache.store(secondUser, for: "second", workspace: .jovie)
    let fresh = ChatCache(defaults: defaults)
    let customerRead = await fresh.load(for: "first", workspace: .jovie)
    let operatorRead = await fresh.load(for: "first", workspace: .ovie)
    let secondRead = await fresh.load(for: "second", workspace: .jovie)
    XCTAssertEqual(customerRead, customer)
    XCTAssertEqual(operatorRead, operatorSnapshot)
    XCTAssertEqual(secondRead, secondUser)
    await cache.remove(for: "first", workspace: .jovie)
    let afterRemoval = ChatCache(defaults: defaults)
    let removed = await afterRemoval.load(for: "first", workspace: .jovie)
    let keptWorkspace = await afterRemoval.load(for: "first", workspace: .ovie)
    let keptUser = await afterRemoval.load(for: "second", workspace: .jovie)
    XCTAssertNil(removed)
    XCTAssertEqual(keptWorkspace, operatorSnapshot)
    XCTAssertEqual(keptUser, secondUser)
    var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(customer)) as? [String: Any])
    legacy.removeValue(forKey: "activeConversationID")
    legacy.removeValue(forKey: "hasMoreOlderByConversationID")
    defaults.set(try JSONSerialization.data(withJSONObject: legacy), forKey: "ie.jov.Jovie.mobileChat.legacy")
    let legacyRead = await ChatCache(defaults: defaults).load(for: "legacy", workspace: .jovie)
    XCTAssertEqual(legacyRead?.messagesByConversationID, customer.messagesByConversationID)
    XCTAssertNil(legacyRead?.activeConversationID)
    XCTAssertNil(legacyRead?.hasMoreOlderByConversationID)
  }

  func testSharedResolverDonorDefaultsAndVoiceRecovery() async throws {
    let suite = "MacChatState.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let cache = ChatCache(defaults: defaults), client = MacHeldChatClient()
    let webURL = try XCTUnwrap(URL(string: "https://web.example.invalid"))
    let identity = NativeChatIdentity(userID: "customer", ownership: nil, workspace: .jovie)
    var created: [NativeChatIdentity] = []
    let make: (NativeChatIdentity) -> ChatRepository = { identity in
      created.append(identity)
      return ChatRepository(client: client, cache: cache, userID: identity.userID, webBaseURL: webURL,
                            workspace: identity.workspace, activityDonator: nil, identity: identity)
    }
    let original = make(identity)
    XCTAssertTrue(ChatRepository.resolve(original, for: identity, create: make) === original)
    XCTAssertEqual(created, [identity])
    for replacement in [NativeChatIdentity(userID: "other", ownership: nil, workspace: .jovie),
                        NativeChatIdentity(userID: "customer", ownership: nil, workspace: .ovie)] {
      let resolved = ChatRepository.resolve(original, for: replacement, create: make)
      XCTAssertFalse(resolved === original)
      XCTAssertEqual(resolved.identity, replacement)
      XCTAssertEqual(resolved.workspace, replacement.workspace)
    }
    XCTAssertEqual(created.count, 3)
    XCTAssertNil(defaultConversationActivityDonator())
    await original.openConversation("thread") // Explicit nil is a supported donor choice.
    XCTAssertEqual(original.activeConversationID, "thread")
    XCTAssertNil(original.lastErrorMessage)
    let donor = MacConversationRecorder()
    let donating = ChatRepository(client: client, cache: cache, userID: identity.userID,
                                  webBaseURL: webURL, activityDonator: donor, identity: identity)
    await donating.openConversation("thread")
    XCTAssertEqual(donor.snapshot(), [.init(conversationID: "thread", title: "Shared thread")])
    for transcript in [" \n", "  recovered memo \n"] {
      let handoff = VoiceMemoActionDraft.shellHandoff(fromTranscript: transcript)
      XCTAssertEqual(handoff.chatDraft, transcript.trimmingCharacters(in: .whitespacesAndNewlines))
      XCTAssertNil(handoff.autoSendMessage)
    }
  }

  func testSharedRepositoryStreamsBeforeEOFAndRejectsLateCanceledOrReplacedEvents() async throws {
    for ending in MacStreamEnding.allCases {
      let suite = "MacChatState.\(UUID().uuidString)"
      let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
      defer { defaults.removePersistentDomain(forName: suite) }
      let client = MacHeldChatClient()
      let repository = ChatRepository(
        client: client, cache: ChatCache(defaults: defaults), userID: "customer",
        webBaseURL: try XCTUnwrap(URL(string: "https://web.example.invalid")), activityDonator: nil,
        identity: NativeChatIdentity(userID: "customer", ownership: nil, workspace: .jovie)
      )
      let sending = Task {
        await repository.send(text: "Question")
        await client.ownerFinished()
      }
      let arrived = await client.waitForFlushOrFinish()
      let beforeEOF = repository.timeline, wasSending = repository.isSending
      let request = await client.request
      switch ending {
      case .complete: break
      case .cancel: sending.cancel()
      case .replaceSelection: repository.startNewConversation()
      }
      // Release and join even on failed arrival; no throwing assertion can strand this client.
      await client.release()
      await sending.value
      XCTAssertTrue(arrived, "The send returned without reaching its flushed partial response")
      XCTAssertTrue(wasSending)
      XCTAssertEqual(beforeEOF.map(\.role), [.user, .assistant])
      XCTAssertEqual(beforeEOF.first?.content, "Question")
      XCTAssertEqual(beforeEOF.last?.content, "Partial")
      XCTAssertEqual(beforeEOF.last?.status.isInFlight, true)
      XCTAssertNotNil(request)
      XCTAssertEqual(beforeEOF.last?.clientTurnId, request?.clientTurnId)
      XCTAssertFalse(repository.isSending)
      let saved = await ChatCache(defaults: defaults).load(for: "customer", workspace: .jovie)
      switch ending {
      case .complete, .cancel:
        let canceled = ending == .cancel
        XCTAssertEqual(repository.activeConversationID, "thread")
        XCTAssertEqual(repository.timeline.last?.content, canceled ? "Partial" : "Finished")
        XCTAssertEqual(repository.timeline.last?.status, canceled ? .canceled : .completed)
        XCTAssertEqual(saved?.activeConversationID, "thread")
        XCTAssertEqual(saved?.messagesByConversationID["thread"]?.count, 2)
        XCTAssertEqual(saved?.messagesByConversationID["thread"]?.last?.content, canceled ? "Partial" : "Finished")
        XCTAssertEqual(saved?.messagesByConversationID["thread"]?.last?.turnStatus, canceled ? "canceled" : "completed")
      case .replaceSelection:
        XCTAssertNil(repository.activeConversationID)
        XCTAssertTrue(repository.timeline.isEmpty)
        XCTAssertNil(saved)
      }
    }
  }
}

private func macChatSnapshot(count: Int) -> CachedChatSnapshot {
  let timestamp = "2026-01-01T00:00:00Z"
  let messages = (0..<count).map { index in
    MobileConversationMessage(id: "message-\(index)", role: "assistant", content: "Message \(index)",
      clientMessageId: "client-\(index)", turnId: "turn-\(index)", turnStatus: "completed",
      createdAt: String(format: "2026-01-01T00:00:%02dZ", index), requiresWebHandoff: index == count - 1)
  }
  return CachedChatSnapshot(conversations: ["other", "thread"].map {
    MobileConversationSummary(id: $0, title: "Shared thread", createdAt: timestamp, updatedAt: timestamp,
                              latestMessageRole: "assistant", latestTurnStatus: "completed")
  }, messagesByConversationID: ["thread": messages], cachedAt: Date(timeIntervalSince1970: 1),
     activeConversationID: "thread", hasMoreOlderByConversationID: ["thread": true])
}

private final class MacConversationRecorder: ConversationActivityDonating, @unchecked Sendable {
  private let lock = NSLock()
  private var donations: [ConversationUserActivity.Payload] = []
  func donate(conversationID: String, title: String) {
    lock.lock()
    defer { lock.unlock() }
    donations.append(.init(conversationID: conversationID, title: title))
  }
  func snapshot() -> [ConversationUserActivity.Payload] {
    lock.lock()
    defer { lock.unlock() }
    return donations
  }
}

private enum MacStreamEnding: CaseIterable { case complete, cancel, replaceSelection }

private actor MacHeldChatClient: MobileChatClientProtocol {
  private(set) var request: MobileChatTurnRequest?
  private var arrival: Bool?
  private var arrivalWaiter: CheckedContinuation<Bool, Never>?
  private var released = false
  private var releaseWaiter: CheckedContinuation<Void, Never>?

  func waitForFlushOrFinish() async -> Bool {
    if let arrival { return arrival }
    return await withCheckedContinuation { arrivalWaiter = $0 }
  }
  private func signalArrival(_ value: Bool) {
    guard arrival == nil else { return }
    arrival = value
    arrivalWaiter?.resume(returning: value)
    arrivalWaiter = nil
  }
  func ownerFinished() { signalArrival(false) }
  func release() {
    released = true
    releaseWaiter?.resume()
    releaseWaiter = nil
  }
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] { [] }
  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    MobileConversationDetailResponse(conversation: .init(id: id, title: " Shared thread ",
      createdAt: "2026-01-01", updatedAt: "2026-01-01"), messages: [], hasMore: false)
  }
  func sendTurn(_ request: MobileChatTurnRequest,
                onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, onAuthorization: nil, onEvent: onEvent)
  }
  func sendTurn(_ request: MobileChatTurnRequest,
                onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
                onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?) async throws -> [MobileChatStreamEvent] {
    try await onAuthorization?(nil)
    self.request = request
    let turn = request.clientTurnId
    await onEvent?(.turnReserved(conversationId: "thread", turnId: "turn", clientTurnId: turn))
    await onEvent?(.assistantDelta(clientTurnId: turn, text: "Partial"))
    await onEvent?(.turnState(clientTurnId: turn, state: "running", eveWorkId: nil))
    signalArrival(true) // The real coalescer has synchronously flushed the delta.
    if !released { await withCheckedContinuation { releaseWaiter = $0 } }
    // Deliberately cancellation-insensitive: production guards must reject late events.
    await onEvent?(.assistantDelta(clientTurnId: turn, text: " late"))
    await onEvent?(.assistantCompleted(clientTurnId: turn, conversationId: "thread", turnId: "turn", text: "Finished"))
    return []
  }
}
