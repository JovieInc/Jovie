import AppKit
import SwiftUI

/// Local plain-text editing. Enter, paste, selection and undo remain AppKit actions.
struct MacComposerTextView: NSViewRepresentable {
  @Binding var text: String
  var focusRequest: UUID?

  func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

  func makeNSView(context: Context) -> NSScrollView {
    let scroll = MacComposerScrollView()
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.backgroundColor = NSColor(JovieColor.surface0)
    let editor = MacComposerEditor(frame: scroll.contentView.bounds)
    editor.isRichText = false
    editor.importsGraphics = false
    editor.allowsUndo = true
    editor.isVerticallyResizable = true
    editor.isHorizontallyResizable = false
    editor.autoresizingMask = [.width]
    editor.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    editor.textContainer?.widthTracksTextView = true
    editor.textContainer?.containerSize = NSSize(width: scroll.contentSize.width, height: CGFloat.greatestFiniteMagnitude)
    editor.textContainerInset = NSSize(width: JovieSpacing.medium, height: JovieSpacing.medium)
    editor.font = JovieFont.appKitBody(size: 16)
    editor.textColor = NSColor(JovieColor.textPrimary)
    editor.insertionPointColor = NSColor(JovieColor.accent)
    editor.backgroundColor = NSColor(JovieColor.surface0)
    editor.setAccessibilityLabel("Local draft")
    editor.setAccessibilityIdentifier("mac-local-draft-editor")
    editor.string = text
    editor.delegate = context.coordinator
    context.coordinator.observeUndo(in: editor)
    editor.onCompositionEnded = { [weak coordinator = context.coordinator, weak editor] in
      guard let editor else { return }
      coordinator?.publish(editor)
    }
    editor.onWindowChanged = { [weak coordinator = context.coordinator, weak editor] in
      guard let editor else { return }
      coordinator?.applyFocus(to: editor)
    }
    scroll.documentView = editor
    return scroll
  }

  func updateNSView(_ scroll: NSScrollView, context: Context) {
    guard let editor = scroll.documentView as? MacComposerEditor else { return }
    context.coordinator.update(editor, text: $text, focusRequest: focusRequest)
  }

  static func dismantleNSView(_ scroll: NSScrollView, coordinator: Coordinator) {
    coordinator.disconnect()
    guard let editor = scroll.documentView as? MacComposerEditor else { return }
    editor.delegate = nil
    editor.onCompositionEnded = nil
    editor.onWindowChanged = nil
    editor.draftUndoManager.removeAllActions()
  }

  @MainActor
  final class Coordinator: NSObject, NSTextViewDelegate {
    private var binding: Binding<String>?
    private weak var editor: MacComposerEditor?
    private var requestedFocus: UUID?
    private var consumedFocus: UUID?
    private var isApplyingModel = false

    init(text: Binding<String>) { binding = text }

    func observeUndo(in editor: MacComposerEditor) {
      self.editor = editor
      for name in [UndoManager.didUndoChangeNotification, UndoManager.didRedoChangeNotification] {
        NotificationCenter.default.addObserver(
          self, selector: #selector(undoOrRedoDidComplete(_:)), name: name, object: editor.draftUndoManager
        )
      }
    }

    @objc private func undoOrRedoDidComplete(_ notification: Notification) {
      guard let editor else { return }
      publish(editor)
    }

    func update(_ editor: MacComposerEditor, text: Binding<String>, focusRequest: UUID?) {
      binding = text
      requestedFocus = focusRequest
      // Composition owns the draft. Conflicting external replacement is discarded,
      // never queued; commit/unmark publishes the native result to the current binding.
      if !editor.hasMarkedText(), editor.string != text.wrappedValue {
        let selection = editor.selectedRanges
        isApplyingModel = true
        editor.string = text.wrappedValue
        editor.undoManager?.removeAllActions()
        let length = (editor.string as NSString).length
        editor.selectedRanges = selection.map { value in
          let range = value.rangeValue
          let location = min(range.location, length)
          return NSValue(range: NSRange(location: location, length: min(range.length, length - location)))
        }
        isApplyingModel = false
      }
      applyFocus(to: editor)
    }

    func textDidChange(_ notification: Notification) {
      guard let editor = notification.object as? MacComposerEditor else { return }
      publish(editor)
    }

    func undoManager(for view: NSTextView) -> UndoManager? {
      (view as? MacComposerEditor)?.draftUndoManager
    }

    func publish(_ editor: MacComposerEditor) {
      guard !isApplyingModel, let binding, binding.wrappedValue != editor.string else { return }
      binding.wrappedValue = editor.string
    }

    func applyFocus(to editor: MacComposerEditor) {
      guard binding != nil, let requestedFocus, requestedFocus != consumedFocus,
            let window = editor.window, window.makeFirstResponder(editor) else { return }
      consumedFocus = requestedFocus
    }

    func disconnect() {
      NotificationCenter.default.removeObserver(self)
      editor = nil
      binding = nil
      requestedFocus = nil
    }
  }
}

/// SwiftUI supplies the viewport size after construction; an empty draft must
/// still fill that viewport so pointer editing does not require the focus button.
private final class MacComposerScrollView: NSScrollView {
  override func tile() {
    super.tile()
    guard let editor = documentView as? NSTextView else { return }
    editor.minSize = NSSize(width: 0, height: contentSize.height)
    if editor.frame.height < contentSize.height {
      editor.setFrameSize(NSSize(width: contentSize.width, height: contentSize.height))
    }
  }
}

/// A dedicated native undo stack prevents a draft reset from clearing other controls.
final class MacComposerEditor: NSTextView {
  let draftUndoManager = UndoManager()
  var onCompositionEnded: (() -> Void)?
  var onWindowChanged: (() -> Void)?

  override func unmarkText() {
    super.unmarkText()
    onCompositionEnded?()
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    onWindowChanged?()
  }
}
