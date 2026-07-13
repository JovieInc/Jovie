import Foundation

/// Swift port of the chat wire-format grammar defined in
/// apps/web/lib/chat/tokens.ts (`ENTITY_PATTERN`, `SKILL_PATTERN`,
/// `escapeLabel`/`unescapeLabel`). Parses `@kind:id[label]` entity mentions
/// and `/skill:id` skill invocations out of prose text into inline
/// `MobileChatProseRun`s, and -- while a message is still streaming --
/// suppresses a trailing run of text that is a strict, in-progress prefix of
/// a valid token so a chip never flickers through its raw wire form before
/// the closing `]` arrives.
///
/// This is a total function: it never throws and always returns *some* runs
/// (falling back to the original text verbatim) for any input, including
/// degenerate/hostile ones (unbalanced brackets, huge labels, control
/// characters, empty strings).
enum MobileChatProseTokenizer {
  private static let knownEntityKinds: Set<String> = ["release", "artist", "track", "event"]

  // Mirrors ENTITY_PATTERN: @(release|artist|track|event):([^\s[\]]+)\[((?:\\.|[^\]\\])*)\]
  private static let entityRegex = try? NSRegularExpression(
    pattern: #"@(release|artist|track|event):([^\s\[\]]+)\[((?:\\.|[^\]\\])*)\]"#
  )

  // Broader than `entityRegex` -- matches ANY `@kind:id[label]`-shaped token
  // regardless of kind, so a pattern-matched-but-unmapped kind (e.g. a future
  // web-side kind this client hasn't shipped support for yet) can be told
  // apart from an ordinary `@mention` like "DM @timwhite" for the
  // contract-drift breadcrumb below. Never used to decide rendering -- only
  // `entityRegex`'s four known kinds ever become chips; this is purely a
  // detection signal.
  private static let anyKindEntityRegex = try? NSRegularExpression(
    pattern: #"@([A-Za-z]\w*):([^\s\[\]]+)\[(?:\\.|[^\]\\])*\]"#
  )

  // Mirrors SKILL_PATTERN: \/skill:([A-Za-z]\w*)
  private static let skillRegex = try? NSRegularExpression(
    pattern: #"/skill:([A-Za-z]\w*)"#
  )

  private struct Hit {
    let range: Range<String.Index>
    let run: MobileChatProseRun
  }

  static func tokenize(_ text: String, isStreaming: Bool) -> [MobileChatProseRun] {
    guard !text.isEmpty else { return [] }

    let visibleText = isStreaming ? suppressTrailingPartialToken(text) : text
    guard !visibleText.isEmpty else { return [] }

    let hits = sortedNonOverlappingHits(in: visibleText)
    guard !hits.isEmpty else { return [.text(visibleText)] }

    var runs: [MobileChatProseRun] = []
    var cursor = visibleText.startIndex

    for hit in hits {
      if hit.range.lowerBound > cursor {
        runs.append(.text(String(visibleText[cursor ..< hit.range.lowerBound])))
      }
      runs.append(hit.run)
      cursor = hit.range.upperBound
    }

    if cursor < visibleText.endIndex {
      runs.append(.text(String(visibleText[cursor...])))
    }

    return runs
  }

  private static func sortedNonOverlappingHits(in text: String) -> [Hit] {
    var hits: [Hit] = []
    let nsRange = NSRange(text.startIndex..., in: text)

    if let entityRegex {
      entityRegex.enumerateMatches(in: text, range: nsRange) { match, _, _ in
        guard
          let match,
          let fullRange = Range(match.range, in: text),
          let kindRange = Range(match.range(at: 1), in: text),
          let idRange = Range(match.range(at: 2), in: text),
          let labelRange = Range(match.range(at: 3), in: text)
        else {
          return
        }

        let kindRaw = String(text[kindRange])
        guard
          knownEntityKinds.contains(kindRaw),
          let kind = MobileChatEntityKind(rawValue: kindRaw)
        else {
          return
        }

        let id = String(text[idRange])
        let label = truncatedChipLabel(unescapeLabel(String(text[labelRange])))
        hits.append(Hit(range: fullRange, run: .entity(kind: kind, id: id, label: label)))
      }
    }

    reportUnmappedEntityKindsIfNeeded(in: text, nsRange: nsRange)

    if let skillRegex {
      skillRegex.enumerateMatches(in: text, range: nsRange) { match, _, _ in
        guard
          let match,
          let fullRange = Range(match.range, in: text),
          let idRange = Range(match.range(at: 1), in: text)
        else {
          return
        }

        let id = String(text[idRange])
        let label = truncatedChipLabel(MobileChatSkillLabels.label(for: id))
        hits.append(Hit(range: fullRange, run: .skill(id: id, label: label)))
      }
    }

    hits.sort { $0.range.lowerBound < $1.range.lowerBound }

    var nonOverlapping: [Hit] = []
    var cursor = text.startIndex
    for hit in hits {
      guard hit.range.lowerBound >= cursor else { continue } // overlap -- drop later hit
      nonOverlapping.append(hit)
      cursor = hit.range.upperBound
    }

    return nonOverlapping
  }

  /// Contract-drift signal (JOV-3608 expansion #1): if the model emits a
  /// well-formed `@kind:id[label]` token whose `kind` isn't one of the four
  /// this client knows about, that's a strong sign the web-side emission
  /// contract shipped a new kind this client hasn't been updated to render
  /// -- as opposed to ordinary prose containing an `@` character, which is
  /// never reported. Rendering is unaffected either way (unmapped kinds
  /// still render verbatim, per web parity); this only adds an observability
  /// breadcrumb so the drift is visible instead of silently degrading to
  /// plain text forever.
  private static func reportUnmappedEntityKindsIfNeeded(in text: String, nsRange: NSRange) {
    guard let anyKindEntityRegex else { return }

    anyKindEntityRegex.enumerateMatches(in: text, range: nsRange) { match, _, _ in
      guard
        let match,
        let kindRange = Range(match.range(at: 1), in: text)
      else {
        return
      }

      let kindRaw = String(text[kindRange])
      guard !knownEntityKinds.contains(kindRaw) else { return }

      Observability.addBreadcrumb(
        .chatEntityTokenUnmappedKind,
        level: .warning,
        context: ["kind": kindRaw]
      )
    }
  }

  /// Chip labels render inline within a single concatenated `Text` (per-run
  /// `lineLimit`/`truncationMode` isn't expressible on `Text` concatenation
  /// segments -- only on the whole view), so "~1 line" truncation for
  /// hostile/oversized labels (JOV-3608 Visual Contract §3) is enforced here
  /// at parse time instead of via SwiftUI layout. A generous character budget
  /// keeps ordinary short titles untouched while still bounding worst-case
  /// labels (the 10k-char hostile-input test) to something that reads as one
  /// line rather than reflowing the whole message.
  private static let maxChipLabelCharacters = 60

  private static func truncatedChipLabel(_ label: String) -> String {
    guard label.count > maxChipLabelCharacters else { return label }
    let prefix = label.prefix(maxChipLabelCharacters).trimmingCharacters(in: .whitespaces)
    return "\(prefix)…"
  }

  /// Reverse of `escapeLabel` in tokens.ts: strips each backslash that
  /// precedes an escaped character (`\]` -> `]`, `\\` -> `\`).
  private static func unescapeLabel(_ label: String) -> String {
    var result = ""
    result.reserveCapacity(label.count)
    var iterator = label.makeIterator()
    while let char = iterator.next() {
      if char == "\\", let next = iterator.next() {
        result.append(next)
      } else {
        result.append(char)
      }
    }
    return result
  }

  /// If the tail of `text` is a strict, still-open prefix of a valid
  /// `@kind:id[label]` or `/skill:id` token, trim it off so the raw wire
  /// syntax never renders mid-stream. Returns `text` unchanged when the tail
  /// is not a live token prefix (including plain `@mentions` like
  /// "DM @timwhite", which never match a known entity kind).
  private static func suppressTrailingPartialToken(_ text: String) -> String {
    if let trimmed = suppressTrailingPartialEntity(text) {
      return trimmed
    }
    if let trimmed = suppressTrailingPartialSkill(text) {
      return trimmed
    }
    return text
  }

  private static func suppressTrailingPartialEntity(_ text: String) -> String? {
    guard let atIndex = text.range(of: "@", options: .backwards) else { return nil }

    let tail = text[atIndex.lowerBound...]

    // Fast-path: if the tail already contains a fully-closed token starting
    // at this `@`, there is nothing partial to suppress.
    if tail.range(of: "\\]", options: .regularExpression) != nil,
       isCompleteEntityToken(String(tail))
    {
      return nil
    }

    // `@kind:` must match one of the four known kinds -- otherwise this is
    // an unrelated `@mention` (e.g. "DM @timwhite") and must render as-is.
    guard let colonIndex = tail.firstIndex(of: ":") else {
      // No colon yet: only a bare "@" or "@rel" partial kind name. Only
      // suppress if what follows "@" so far is itself a valid prefix of one
      // of the four kind names (so "@timwhite" is never touched).
      let kindSoFar = tail.dropFirst()
      guard isPrefixOfKnownKind(String(kindSoFar)) else { return nil }
      return String(text[..<atIndex.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    let kind = String(tail[tail.index(after: atIndex.lowerBound) ..< colonIndex])
    guard knownEntityKinds.contains(kind) else { return nil }

    let afterColon = tail[tail.index(after: colonIndex)...]
    guard let bracketIndex = afterColon.firstIndex(of: "[") else {
      // "@release:rel_1" with no "[" yet -- still an open id, still partial.
      // The id segment itself can't contain whitespace/brackets by grammar;
      // if it does, this isn't a token in progress, so don't suppress.
      if afterColon.contains(where: { $0.isWhitespace }) { return nil }
      return String(text[..<atIndex.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    let idPart = afterColon[afterColon.startIndex ..< bracketIndex]
    guard !idPart.isEmpty, !idPart.contains(where: { $0.isWhitespace }) else { return nil }

    let labelPart = afterColon[afterColon.index(after: bracketIndex)...]
    if hasUnescapedClosingBracket(String(labelPart)) {
      // Label is fully closed -- this is a complete token, not a partial one.
      return nil
    }

    // Open "[" with no closing "]" yet (respecting escapes) -- partial.
    return String(text[..<atIndex.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func suppressTrailingPartialSkill(_ text: String) -> String? {
    guard let slashIndex = text.range(of: "/skill:", options: .backwards) else { return nil }
    let idPart = text[slashIndex.upperBound...]

    // A skill token has no closing delimiter -- it ends at the first
    // non-word character or end of string. If the tail (from "/skill:" to
    // end of string) is entirely word characters, the stream could still be
    // mid-id, so suppress. If a non-word character already terminates it,
    // the token is already complete and was matched by the full regex pass.
    guard !idPart.isEmpty else {
      return String(text[..<slashIndex.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    let isAllWordChars = idPart.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
    guard isAllWordChars else { return nil }

    return String(text[..<slashIndex.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func isPrefixOfKnownKind(_ prefix: String) -> Bool {
    guard !prefix.isEmpty else { return true } // bare "@" -- always a live prefix
    return knownEntityKinds.contains { $0.hasPrefix(prefix) }
  }

  private static func isCompleteEntityToken(_ candidate: String) -> Bool {
    guard let entityRegex else { return false }
    let range = NSRange(candidate.startIndex..., in: candidate)
    guard let match = entityRegex.firstMatch(in: candidate, range: range) else { return false }
    // Must match starting at the very first character (the "@") for this to
    // be "this token is complete", not "a later token is complete".
    return match.range.location == 0
  }

  /// True if `label` contains a `]` that is not escaped by a preceding `\`.
  private static func hasUnescapedClosingBracket(_ label: String) -> Bool {
    var previousWasBackslash = false
    for char in label {
      if char == "]", !previousWasBackslash {
        return true
      }
      previousWasBackslash = (char == "\\") && !previousWasBackslash
    }
    return false
  }
}
