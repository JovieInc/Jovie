import Foundation

// Merch-artifact decoding, extracted from MobileChatContentParser.
// Distinct concern: turns tool-result JSON into merch option/design cards.
extension MobileChatContentParser {
  static let merchArtifactToolNames: Set<String> = [
    "createMerch",
    "previewMerchOptions",
  ]

  static func extractJsonPayload(from block: String) -> Data? {
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

  static func decodeMerchArtifact(from data: Data) -> MobileChatMerchArtifact? {
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

  static func suppressMerchEnumerationProse(
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
