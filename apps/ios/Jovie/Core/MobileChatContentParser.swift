import Foundation

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

  /// Memoizes `segments(from:isStreaming:)` keyed by the exact `(content,
  /// isStreaming)` pair. SwiftUI re-evaluates `MobileChatMessageRow.body` on
  /// every timeline mutation while a message streams, which previously
  /// re-ran the full tool-call/entity/skill parse on every delta even though
  /// most deltas only append characters far from an already-parsed prefix.
  /// `NSCache` (not a plain dictionary) so memory pressure can evict entries
  /// automatically -- matches the cache pattern used elsewhere in the iOS
  /// app (see `.claude/rules/ios.md` performance canon).
  private final class SegmentCacheKey: NSObject {
    let content: String
    let isStreaming: Bool

    init(content: String, isStreaming: Bool) {
      self.content = content
      self.isStreaming = isStreaming
    }

    override var hash: Int {
      var hasher = Hasher()
      hasher.combine(content)
      hasher.combine(isStreaming)
      return hasher.finalize()
    }

    override func isEqual(_ object: Any?) -> Bool {
      guard let other = object as? SegmentCacheKey else { return false }
      return content == other.content && isStreaming == other.isStreaming
    }
  }

  private final class SegmentCacheBox {
    let segments: [MobileChatRenderableSegment]
    init(_ segments: [MobileChatRenderableSegment]) { self.segments = segments }
  }

  private static let segmentCache: NSCache<SegmentCacheKey, SegmentCacheBox> = {
    let cache = NSCache<SegmentCacheKey, SegmentCacheBox>()
    cache.countLimit = 64
    return cache
  }()

  static func segments(
    from content: String,
    isStreaming: Bool
  ) -> [MobileChatRenderableSegment] {
    guard !content.isEmpty else { return [] }

    let cacheKey = SegmentCacheKey(content: content, isStreaming: isStreaming)
    if let cached = segmentCache.object(forKey: cacheKey) {
      return cached.segments
    }

    let parsed = parseSegments(from: content, isStreaming: isStreaming)
    segmentCache.setObject(SegmentCacheBox(parsed), forKey: cacheKey)
    return parsed
  }

  private static func parseSegments(
    from content: String,
    isStreaming: Bool
  ) -> [MobileChatRenderableSegment] {
    let toolResults = parseToolResults(from: content)
    let merchArtifacts = toolResults.merchArtifacts
    let resultStates = toolResults.states
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
          isStreaming: isStreaming,
          to: &segments
        )
        break
      }

      appendTextSegment(
        sanitizeResidualToolMarkup(
          String(sanitized[cursor ..< nextBlock.openRange.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        ),
        isStreaming: false,
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
        if
          let toolName,
          let artifact = merchArtifacts[toolName],
          model.state == .succeeded
        {
          segments.append(.merchArtifact(artifact))
        }
      }

      cursor = closeRange.upperBound
    }

    return suppressMerchEnumerationProse(in: segments, hasMerchArtifacts: !merchArtifacts.isEmpty)
  }

  static func displayText(from content: String, isStreaming: Bool) -> String {
    segments(from: content, isStreaming: isStreaming)
      .compactMap { segment -> String? in
        guard case let .text(runs) = segment else { return nil }
        return runs.map(Self.plainText(for:)).joined()
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

  /// Reduces a prose run to its user-facing label text, discarding wire
  /// markup. Used for `displayText` (accessibility / plain-text callers) --
  /// interactive rendering should use `MobileChatProseRun` directly instead
  /// so entity/skill runs can render as inline chips.
  private static func plainText(for run: MobileChatProseRun) -> String {
    switch run {
    case let .text(text):
      return text
    case let .entity(_, _, label):
      return label
    case let .skill(_, label):
      return label
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

  private struct ParsedToolResults {
    let states: [String: MobileChatToolCallState]
    let merchArtifacts: [String: MobileChatMerchArtifact]
  }

  private static func parseToolResults(from content: String) -> ParsedToolResults {
    var states: [String: MobileChatToolCallState] = [:]
    var merchArtifacts: [String: MobileChatMerchArtifact] = [:]
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

        guard
          merchArtifactToolNames.contains(trimmedName),
          let jsonPayload = extractJsonPayload(from: block),
          let artifact = decodeMerchArtifact(from: jsonPayload)
        else {
          return
        }

        merchArtifacts[trimmedName] = artifact
      }
    }

    return ParsedToolResults(states: states, merchArtifacts: merchArtifacts)
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

  private static func appendTextSegment(
    _ text: String,
    isStreaming: Bool,
    to segments: inout [MobileChatRenderableSegment]
  ) {
    guard !text.isEmpty else { return }
    let runs = MobileChatProseTokenizer.tokenize(text, isStreaming: isStreaming)
    guard !runs.isEmpty else { return }
    segments.append(.text(runs: runs))
  }

  private static let merchArtifactToolNames: Set<String> = [
    "createMerch",
    "previewMerchOptions",
  ]

  private static func extractJsonPayload(from block: String) -> Data? {
    if let tagged = firstCapture(in: block, pattern: "<json>\\s*([\\s\\S]*?)\\s*</json>") {
      return tagged.data(using: .utf8)
    }

    let trimmed = block.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("{"), let data = trimmed.data(using: .utf8) {
      return data
    }

    guard
      let start = trimmed.firstIndex(of: "{"),
      let end = trimmed.lastIndex(of: "}")
    else {
      return nil
    }

    return String(trimmed[start ... end]).data(using: .utf8)
  }

  private static func decodeMerchArtifact(from data: Data) -> MobileChatMerchArtifact? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }

    guard (object["success"] as? Bool) == true else { return nil }
    guard let generationId = object["generationId"] as? String, !generationId.isEmpty else {
      return nil
    }

    if let options = object["options"] as? [[String: Any]], !options.isEmpty {
      let cards = options.compactMap(parseMerchOptionCard)
      guard !cards.isEmpty else { return nil }
      return .productOptions(
        MobileChatMerchOptionsPayload(
          generationId: generationId,
          nextStep: object["nextStep"] as? String,
          options: cards
        )
      )
    }

    if let designs = object["designs"] as? [[String: Any]], !designs.isEmpty {
      let cards = designs.compactMap(parseMerchDesignCard)
      guard !cards.isEmpty else { return nil }
      return .designCarousel(
        MobileChatMerchDesignsPayload(
          generationId: generationId,
          nextStep: object["nextStep"] as? String,
          designs: cards
        )
      )
    }

    return nil
  }

  private static func parseMerchOptionCard(_ raw: [String: Any]) -> MobileChatMerchOptionCard? {
    guard
      let id = raw["id"] as? String,
      let designName = raw["design_name"] as? String,
      let productType = raw["product_type"] as? String
    else {
      return nil
    }

    let optionNumber =
      (raw["option_number"] as? Int)
        ?? (raw["option_number"] as? NSNumber)?.intValue
        ?? 0
    let concept = (raw["concept"] as? String) ?? ""
    let printfulName = raw["printful_product_name"] as? String
    let mockupURL = preferredMockupURL(from: raw["mockup_urls"])
    let salePrice = (raw["price_recommendation"] as? [String: Any])?["sale_price"] as? String

    return MobileChatMerchOptionCard(
      id: id,
      optionNumber: optionNumber,
      designName: designName,
      productLabel: printfulName ?? productType,
      colorway: raw["colorway"] as? String,
      concept: concept,
      mockupURL: mockupURL,
      salePrice: salePrice
    )
  }

  private static func parseMerchDesignCard(_ raw: [String: Any]) -> MobileChatMerchDesignCard? {
    guard
      let id = raw["id"] as? String,
      let designName = raw["design_name"] as? String
    else {
      return nil
    }

    let optionNumber =
      (raw["option_number"] as? Int)
        ?? (raw["option_number"] as? NSNumber)?.intValue
        ?? 0
    let status = (raw["status"] as? String) ?? "ready"
    let previewURL = (raw["preview_url"] as? String).flatMap(URL.init(string:))

    return MobileChatMerchDesignCard(
      id: id,
      optionNumber: optionNumber,
      designName: designName,
      concept: (raw["concept"] as? String) ?? "",
      previewURL: previewURL,
      isReady: status == "ready" && previewURL != nil
    )
  }

  private static func preferredMockupURL(from value: Any?) -> URL? {
    guard let urls = value as? [String] else { return nil }
    return urls.compactMap(URL.init(string:)).first
  }

  private static func suppressMerchEnumerationProse(
    in segments: [MobileChatRenderableSegment],
    hasMerchArtifacts: Bool
  ) -> [MobileChatRenderableSegment] {
    guard hasMerchArtifacts else { return segments }

    return segments.compactMap { segment -> MobileChatRenderableSegment? in
      guard case let .text(runs) = segment else { return segment }

      let filteredRuns = runs.compactMap { run -> MobileChatProseRun? in
        guard case let .text(text) = run else { return run }
        let sanitized = sanitizeMerchEnumerationProse(text)
        guard !sanitized.isEmpty else { return nil }
        return .text(sanitized)
      }

      guard !filteredRuns.isEmpty else { return nil }
      return .text(runs: filteredRuns)
    }
  }

  static func sanitizeMerchEnumerationProse(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }

    let enumerationPatterns = [
      #"\*\*\d+\."#,
      #"^\d+\.\s+\*\*"#,
      #"(?i)\boption\s+[123]\b"#,
    ]

    for pattern in enumerationPatterns {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
        continue
      }
      let range = NSRange(trimmed.startIndex..., in: trimmed)
      if regex.firstMatch(in: trimmed, range: range) != nil {
        return ""
      }
    }

    return trimmed
  }
}
