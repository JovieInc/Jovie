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
  private enum ToolCallDialect {
    case toolCall
    case functionCalls

    var openTag: String {
      switch self {
      case .toolCall: "<tool_call>"
      case .functionCalls: "<function_calls>"
      }
    }

    var closeTag: String {
      switch self {
      case .toolCall: "</tool_call>"
      case .functionCalls: "</function_calls>"
      }
    }
  }

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
      guard let nextBlock = nextToolCallBlock(in: sanitized, from: cursor) else {
        appendTextSegment(
          sanitizeResidualToolMarkup(
            String(sanitized[cursor...]).trimmingCharacters(in: .whitespacesAndNewlines)
          ),
          to: &segments
        )
        break
      }

      appendTextSegment(
        sanitizeResidualToolMarkup(
          String(sanitized[cursor ..< nextBlock.openRange.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        ),
        to: &segments
      )

      let afterOpen = nextBlock.openRange.upperBound
      guard
        let closeRange = sanitized.range(
          of: nextBlock.dialect.closeTag,
          range: afterOpen ..< sanitized.endIndex
        )
      else {
        if let partial = parseToolInvocationBlock(
          String(sanitized[afterOpen...]),
          dialect: nextBlock.dialect,
          isComplete: false,
          resultState: nil
        ) {
          segments.append(.toolCall(partial))
        }
        break
      }

      let block = String(sanitized[afterOpen ..< closeRange.lowerBound])
      let toolName = extractToolName(from: block, dialect: nextBlock.dialect)
      if let model = parseToolInvocationBlock(
        block,
        dialect: nextBlock.dialect,
        isComplete: true,
        resultState: toolName.flatMap { resultStates[$0] }
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

  private struct NextToolCallBlock {
    let dialect: ToolCallDialect
    let openRange: Range<String.Index>
  }

  private static func nextToolCallBlock(
    in content: String,
    from cursor: String.Index
  ) -> NextToolCallBlock? {
    let searchRange = cursor ..< content.endIndex
    var earliest: NextToolCallBlock?

    for dialect in [ToolCallDialect.toolCall, .functionCalls] {
      guard let openRange = content.range(of: dialect.openTag, range: searchRange) else {
        continue
      }

      if let current = earliest {
        if openRange.lowerBound < current.openRange.lowerBound {
          earliest = NextToolCallBlock(dialect: dialect, openRange: openRange)
        }
      } else {
        earliest = NextToolCallBlock(dialect: dialect, openRange: openRange)
      }
    }

    return earliest
  }

  private static func extractToolName(
    from block: String,
    dialect: ToolCallDialect
  ) -> String? {
    switch dialect {
    case .toolCall:
      return firstCapture(in: block, pattern: "<name>\\s*([^<]+?)\\s*</name>")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .flatMap { $0.isEmpty ? nil : $0 }
    case .functionCalls:
      return extractInvokeToolName(from: block)
    }
  }

  private static func suppressIncompleteToolMarkup(_ content: String, isStreaming: Bool) -> String {
    guard isStreaming else { return content }

    var sanitized = content
    let incompleteOpenTags = [
      "<tool_result",
      "<function_result",
    ]

    for openTag in incompleteOpenTags {
      guard let openRange = sanitized.range(of: openTag, options: [.backwards, .caseInsensitive]) else {
        continue
      }

      let tail = sanitized[openRange.lowerBound...]
      let closeTag = closeTag(forIncompleteOpen: openTag)
      if !tail.localizedCaseInsensitiveContains(closeTag) {
        sanitized = String(sanitized[..<openRange.lowerBound])
      }
    }

    return sanitized
  }

  private static func closeTag(forIncompleteOpen openTag: String) -> String {
    let normalized = openTag.trimmingCharacters(in: CharacterSet(charactersIn: "<"))
    return "</\(normalized)>"
  }

  private static func stripToolResultMarkup(from content: String) -> String {
    var sanitized = content
    let patterns = [
      "<tool_result>[\\s\\S]*?</tool_result>",
      "<function_result>[\\s\\S]*?</function_result>",
    ]

    for pattern in patterns {
      while let range = sanitized.range(of: pattern, options: [.regularExpression, .caseInsensitive]) {
        sanitized.removeSubrange(range)
      }
    }

    return sanitized
  }

  private static func sanitizeResidualToolMarkup(_ text: String) -> String {
    guard !text.isEmpty else { return text }

    var sanitized = text
    let patterns = [
      "<([a-z_]+_calls?)>[\\s\\S]*?</\\1>",
      "<invoke[^>]*>[\\s\\S]*?</invoke>",
      "<parameter[^>]*>[\\s\\S]*?</parameter>",
      "<function_result>[\\s\\S]*?</function_result>",
      "<tool_result>[\\s\\S]*?</tool_result>",
    ]

    for pattern in patterns {
      while let range = sanitized.range(of: pattern, options: [.regularExpression, .caseInsensitive]) {
        sanitized.removeSubrange(range)
      }
    }

    return sanitized.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func parseToolResultStates(from content: String) -> [String: MobileChatToolCallState] {
    var states: [String: MobileChatToolCallState] = [:]
    let fallbackToolName = extractMostRecentToolName(from: content)
    let patterns = [
      "<tool_result>([\\s\\S]*?)</tool_result>",
      "<function_result>([\\s\\S]*?)</function_result>",
    ]

    for pattern in patterns {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
        continue
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
        let toolName =
          firstCapture(in: block, pattern: "<name>\\s*([^<]+?)\\s*</name>")
            ?? firstCapture(in: block, pattern: "\"toolName\"\\s*:\\s*\"([^\"]+)\"")
            ?? firstCapture(in: block, pattern: "\"name\"\\s*:\\s*\"([^\"]+)\"")
            ?? fallbackToolName

        guard let toolName else { return }

        let trimmedName = toolName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        states[trimmedName] = resolveResultState(from: block)
      }
    }

    return states
  }

  private static func extractMostRecentToolName(from content: String) -> String? {
    var latest: (index: String.Index, name: String)?

    let toolCallPattern = "<tool_call>[\\s\\S]*?<name>\\s*([^<]+?)\\s*</name>[\\s\\S]*?</tool_call>"
    if let regex = try? NSRegularExpression(pattern: toolCallPattern, options: [.caseInsensitive]) {
      let range = NSRange(content.startIndex..., in: content)
      regex.enumerateMatches(in: content, range: range) { match, _, _ in
        guard
          let match,
          let openRange = Range(match.range, in: content),
          let nameRange = Range(match.range(at: 1), in: content)
        else {
          return
        }

        let name = String(content[nameRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        if let current = latest {
          if openRange.lowerBound > current.index {
            latest = (openRange.lowerBound, name)
          }
        } else {
          latest = (openRange.lowerBound, name)
        }
      }
    }

    let functionCallsPattern =
      "<function_calls>[\\s\\S]*?<invoke[^>]*name=[\"']([^\"']+)[\"'][\\s\\S]*?</function_calls>"
    if let regex = try? NSRegularExpression(pattern: functionCallsPattern, options: [.caseInsensitive]) {
      let range = NSRange(content.startIndex..., in: content)
      regex.enumerateMatches(in: content, range: range) { match, _, _ in
        guard
          let match,
          let openRange = Range(match.range, in: content),
          let nameRange = Range(match.range(at: 1), in: content)
        else {
          return
        }

        let name = String(content[nameRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        if let current = latest {
          if openRange.lowerBound > current.index {
            latest = (openRange.lowerBound, name)
          }
        } else {
          latest = (openRange.lowerBound, name)
        }
      }
    }

    return latest?.name
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

  private static func parseToolInvocationBlock(
    _ block: String,
    dialect: ToolCallDialect,
    isComplete: Bool,
    resultState: MobileChatToolCallState?
  ) -> MobileChatToolCallCardModel? {
    switch dialect {
    case .toolCall:
      return parseToolCallBlock(block, isComplete: isComplete, resultState: resultState)
    case .functionCalls:
      return parseFunctionCallsBlock(block, isComplete: isComplete, resultState: resultState)
    }
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
    return buildToolCallCard(
      toolName: trimmedName,
      parameters: parameters,
      block: block,
      isComplete: isComplete,
      resultState: resultState
    )
  }

  private static func parseFunctionCallsBlock(
    _ block: String,
    isComplete: Bool,
    resultState: MobileChatToolCallState?
  ) -> MobileChatToolCallCardModel? {
    guard let toolName = extractInvokeToolName(from: block) else {
      return nil
    }

    let parameters = parseInvokeParameters(from: block)
    return buildToolCallCard(
      toolName: toolName,
      parameters: parameters,
      block: block,
      isComplete: isComplete,
      resultState: resultState
    )
  }

  private static func extractInvokeToolName(from block: String) -> String? {
    let patterns = [
      "<invoke[^>]*name=\"([^\"]+)\"",
      "<invoke[^>]*name='([^']+)'",
    ]

    for pattern in patterns {
      if let toolName = firstCapture(in: block, pattern: pattern) {
        let trimmedName = toolName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty {
          return trimmedName
        }
      }
    }

    return nil
  }

  private static func parseInvokeParameters(from block: String) -> [String: String] {
    var values: [String: String] = [:]
    let patterns = [
      "<parameter[^>]*name=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</parameter>",
      "<parameter[^>]*name='([^']+)'[^>]*>([\\s\\S]*?)</parameter>",
    ]

    for pattern in patterns {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
        continue
      }

      let range = NSRange(block.startIndex..., in: block)
      regex.enumerateMatches(in: block, range: range) { match, _, _ in
        guard
          let match,
          let keyRange = Range(match.range(at: 1), in: block),
          let valueRange = Range(match.range(at: 2), in: block)
        else {
          return
        }

        let key = String(block[keyRange])
        let value = String(block[valueRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        values[key] = value
      }
    }

    return values
  }

  private static func buildToolCallCard(
    toolName: String,
    parameters: [String: String],
    block: String,
    isComplete: Bool,
    resultState: MobileChatToolCallState?
  ) -> MobileChatToolCallCardModel {
    let state = resultState ?? (isComplete ? .running : .running)

    return MobileChatToolCallCardModel(
      id: "tool:\(toolName):\(block.hashValue)",
      toolName: toolName,
      title: resolvedTitle(for: toolName, state: state),
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
      "productType",
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
