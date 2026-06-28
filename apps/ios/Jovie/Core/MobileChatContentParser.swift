import Foundation

enum MobileChatToolCallState: Equatable, Sendable {
  case running
  case succeeded
  case failed
}

struct MobileChatToolCallCardModel: Equatable, Identifiable, Sendable {
  let id: String
  let toolName: String
  let title: String
  let body: String?
  let state: MobileChatToolCallState
}

enum MobileChatRenderableSegment: Equatable, Identifiable, Sendable {
  case text(String)
  case toolCall(MobileChatToolCallCardModel)

  var id: String {
    switch self {
    case let .text(text):
      return "text:\(text.hashValue)"
    case let .toolCall(model):
      return model.id
    }
  }
}

enum MobileChatContentParser {
  static func segments(
    from content: String,
    isStreaming: Bool
  ) -> [MobileChatRenderableSegment] {
    guard !content.isEmpty else { return [] }

    let resultStates = parseToolResultStates(from: content)
    let sanitized = suppressIncompleteToolMarkup(
      stripToolResultMarkup(from: content),
      isStreaming: isStreaming
    )

    var segments: [MobileChatRenderableSegment] = []
    var cursor = sanitized.startIndex

    while cursor < sanitized.endIndex {
      guard
        let openRange = sanitized.range(
          of: "<tool_call>",
          range: cursor ..< sanitized.endIndex
        )
      else {
        appendTextSegment(
          String(sanitized[cursor...]).trimmingCharacters(in: .whitespacesAndNewlines),
          to: &segments
        )
        break
      }

      appendTextSegment(
        String(sanitized[cursor ..< openRange.lowerBound])
          .trimmingCharacters(in: .whitespacesAndNewlines),
        to: &segments
      )

      let afterOpen = openRange.upperBound
      guard
        let closeRange = sanitized.range(
          of: "</tool_call>",
          range: afterOpen ..< sanitized.endIndex
        )
      else {
        if let partial = parseToolCallBlock(
          String(sanitized[afterOpen...]),
          isComplete: false,
          resultState: nil
        ) {
          segments.append(.toolCall(partial))
        }
        break
      }

      let block = String(sanitized[afterOpen ..< closeRange.lowerBound])
      if let model = parseToolCallBlock(
        block,
        isComplete: true,
        resultState: resultStates[firstCapture(in: block, pattern: "<name>\\s*([^<]+?)\\s*</name>") ?? ""]
      ) {
        segments.append(.toolCall(model))
      }

      cursor = closeRange.upperBound
    }

    return segments
  }

  static func displayText(from content: String, isStreaming: Bool) -> String {
    segments(from: content, isStreaming: isStreaming)
      .compactMap { segment -> String? in
        guard case let .text(text) = segment else { return nil }
        return text
      }
      .filter { !$0.isEmpty }
      .joined(separator: "\n\n")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func suppressIncompleteToolMarkup(_ content: String, isStreaming: Bool) -> String {
    guard isStreaming else { return content }

    var sanitized = content

    if let openRange = sanitized.range(
      of: "<tool_result",
      options: [.backwards, .caseInsensitive]
    ) {
      let tail = sanitized[openRange.lowerBound...]
      if !tail.contains("</tool_result>") {
        sanitized = String(sanitized[..<openRange.lowerBound])
      }
    }

    return sanitized
  }

  private static func stripToolResultMarkup(from content: String) -> String {
    var sanitized = content
    while let range = sanitized.range(
      of: "<tool_result>[\\s\\S]*?</tool_result>",
      options: .regularExpression
    ) {
      sanitized.removeSubrange(range)
    }
    return sanitized
  }

  private static func parseToolResultStates(from content: String) -> [String: MobileChatToolCallState] {
    var states: [String: MobileChatToolCallState] = [:]
    let pattern = "<tool_result>([\\s\\S]*?)</tool_result>"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
      return states
    }

    let range = NSRange(content.startIndex..., in: content)
    regex.enumerateMatches(in: content, range: range) { match, _, _ in
      guard
        let match,
        let blockRange = Range(match.range(at: 1), in: content)
      else {
        return
      }

      let block = String(content[blockRange])
      guard let toolName = firstCapture(in: block, pattern: "<name>\\s*([^<]+?)\\s*</name>") else {
        return
      }

      let trimmedName = toolName.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmedName.isEmpty else { return }

      states[trimmedName] = resolveResultState(from: block)
    }

    return states
  }

  private static func resolveResultState(from block: String) -> MobileChatToolCallState {
    if let explicitState = firstCapture(in: block, pattern: "<state>\\s*([^<]+?)\\s*</state>") {
      let normalized = explicitState.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if normalized.contains("fail") || normalized.contains("denied") || normalized.contains("error") {
        return .failed
      }
      if normalized.contains("pending") || normalized.contains("approval") || normalized.contains("running") {
        return .running
      }
      if normalized.contains("success") || normalized.contains("complete") {
        return .succeeded
      }
    }

    let lower = block.lowercased()
    if lower.contains("denied") || lower.contains("failed") || lower.contains("error") {
      return .failed
    }
    if lower.contains("pending") || lower.contains("needs-approval") || lower.contains("approval") {
      return .running
    }
    return .succeeded
  }

  private static func parseToolCallBlock(
    _ block: String,
    isComplete: Bool,
    resultState: MobileChatToolCallState?
  ) -> MobileChatToolCallCardModel? {
    guard let toolName = firstCapture(in: block, pattern: "<name>\\s*([^<]+?)\\s*</name>") else {
      return nil
    }

    let trimmedName = toolName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedName.isEmpty else { return nil }

    let parameters = parseParameters(from: block)
    let state = resultState ?? (isComplete ? .running : .running)

    return MobileChatToolCallCardModel(
      id: "tool:\(trimmedName):\(block.hashValue)",
      toolName: trimmedName,
      title: resolvedTitle(for: trimmedName, state: state),
      body: summarizeParameters(parameters),
      state: state
    )
  }

  private static func parseParameters(from block: String) -> [String: String] {
    guard
      let parametersBlock = firstCapture(
        in: block,
        pattern: "<parameters>([\\s\\S]*?)</parameters>"
      )
    else {
      return [:]
    }

    var values: [String: String] = [:]
    let elementPattern = "<([A-Za-z0-9_]+)>\\s*([\\s\\S]*?)\\s*</\\1>"
    guard let regex = try? NSRegularExpression(pattern: elementPattern) else {
      return values
    }

    let range = NSRange(parametersBlock.startIndex..., in: parametersBlock)
    regex.enumerateMatches(in: parametersBlock, range: range) { match, _, _ in
      guard
        let match,
        let keyRange = Range(match.range(at: 1), in: parametersBlock),
        let valueRange = Range(match.range(at: 2), in: parametersBlock)
      else {
        return
      }

      let key = String(parametersBlock[keyRange])
      let value = String(parametersBlock[valueRange])
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !value.isEmpty else { return }
      values[key] = value
    }

    return values
  }

  private static func summarizeParameters(_ parameters: [String: String]) -> String? {
    guard !parameters.isEmpty else { return nil }

    let prioritizedKeys = [
      "artistName",
      "title",
      "name",
      "query",
      "platform",
      "field",
      "artistGenres",
      "releaseContext",
    ]

    var parts: [String] = []
    for key in prioritizedKeys {
      if let value = parameters[key], !value.isEmpty {
        parts.append(value)
      }
      if parts.count == 2 { break }
    }

    if parts.isEmpty {
      parts = parameters.values.prefix(2).map { $0 }
    }

    let summary = parts.joined(separator: " · ")
    return summary.isEmpty ? nil : summary
  }

  private static func resolvedTitle(
    for toolName: String,
    state: MobileChatToolCallState
  ) -> String {
    let labels = MobileChatToolLabels.registry[toolName]
    switch state {
    case .running:
      return labels?.loadingTitle ?? "\(MobileChatToolLabels.displayName(for: toolName))…"
    case .succeeded:
      return labels?.successTitle ?? MobileChatToolLabels.displayName(for: toolName)
    case .failed:
      return labels?.errorTitle ?? "Couldn't complete \(MobileChatToolLabels.displayName(for: toolName).lowercased())"
    }
  }

  private static func firstCapture(in text: String, pattern: String) -> String? {
    guard
      let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
      let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
      let range = Range(match.range(at: 1), in: text)
    else {
      return nil
    }

    return String(text[range])
  }

  private static func appendTextSegment(_ text: String, to segments: inout [MobileChatRenderableSegment]) {
    guard !text.isEmpty else { return }
    segments.append(.text(text))
  }
}

enum MobileChatToolLabels {
  struct ToolLabel: Sendable {
    let loadingTitle: String
    let successTitle: String
    let errorTitle: String
  }

  static let registry: [String: ToolLabel] = [
    "createMerch": ToolLabel(
      loadingTitle: "Creating merch options…",
      successTitle: "Merch options ready",
      errorTitle: "Couldn't create merch"
    ),
    "previewMerchOptions": ToolLabel(
      loadingTitle: "Preparing merch options…",
      successTitle: "Merch options ready",
      errorTitle: "Couldn't prepare merch"
    ),
    "proposeProfileEdit": ToolLabel(
      loadingTitle: "Updating your profile…",
      successTitle: "Profile updated",
      errorTitle: "Couldn't update your profile"
    ),
    "proposeSocialLink": ToolLabel(
      loadingTitle: "Adding your link…",
      successTitle: "Link added",
      errorTitle: "Couldn't add that link"
    ),
    "importBioFromUrl": ToolLabel(
      loadingTitle: "Importing your bio…",
      successTitle: "Bio imported",
      errorTitle: "Couldn't import that bio"
    ),
    "generateAlbumArt": ToolLabel(
      loadingTitle: "Creating your album art…",
      successTitle: "Album art ready",
      errorTitle: "Couldn't create your album art"
    ),
  ]

  static func displayName(for toolName: String) -> String {
    registry[toolName]?.successTitle
      ?? toolName
        .replacingOccurrences(of: "([a-z])([A-Z])", with: "$1 $2", options: .regularExpression)
        .capitalized
  }
}