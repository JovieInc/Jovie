import Foundation

/// Hoisted regexes for `MobileChatContentParser`.
/// `NSRegularExpression` construction is expensive; the swift-arch ratchet
/// (`per-call-formatter-or-regex`) forbids allocating them on hot parse paths.
/// Patterns mirror the former inline string literals. Kept in this file so
/// `MobileChatContentParser.swift` stays under the company size budget.
extension MobileChatContentParser {
  static let toolResultRegex = try? NSRegularExpression(
    pattern: #"<tool_result>([\s\S]*?)</tool_result>"#,
    options: [.caseInsensitive]
  )
  static let functionResultRegex = try? NSRegularExpression(
    pattern: #"<function_result>([\s\S]*?)</function_result>"#,
    options: [.caseInsensitive]
  )
  static let toolCallNameRegex = try? NSRegularExpression(
    pattern: #"<tool_call>[\s\S]*?<name>\s*([^<]+?)\s*</name>[\s\S]*?</tool_call>"#,
    options: [.caseInsensitive]
  )
  static let functionCallsNameRegex = try? NSRegularExpression(
    pattern: #"<function_calls>[\s\S]*?<invoke[^>]*name=["']([^"']+)["'][\s\S]*?</function_calls>"#,
    options: [.caseInsensitive]
  )
  static let parameterDoubleQuoteRegex = try? NSRegularExpression(
    pattern: #"<parameter[^>]*name="([^"]+)"[^>]*>([\s\S]*?)</parameter>"#,
    options: [.caseInsensitive]
  )
  static let parameterSingleQuoteRegex = try? NSRegularExpression(
    pattern: #"<parameter[^>]*name='([^']+)'[^>]*>([\s\S]*?)</parameter>"#,
    options: [.caseInsensitive]
  )
  static let parameterElementRegex = try? NSRegularExpression(
    pattern: #"<([A-Za-z0-9_]+)>\s*([\s\S]*?)\s*</\1>"#
  )

  static let nameTagCaptureRegex = try? NSRegularExpression(
    pattern: #"<name>\s*([^<]+?)\s*</name>"#,
    options: [.caseInsensitive]
  )
  static let toolNameJSONCaptureRegex = try? NSRegularExpression(
    pattern: #""toolName"\s*:\s*"([^"]+)""#,
    options: [.caseInsensitive]
  )
  static let nameJSONCaptureRegex = try? NSRegularExpression(
    pattern: #""name"\s*:\s*"([^"]+)""#,
    options: [.caseInsensitive]
  )
  static let stateTagCaptureRegex = try? NSRegularExpression(
    pattern: #"<state>\s*([^<]+?)\s*</state>"#,
    options: [.caseInsensitive]
  )
  static let invokeDoubleQuoteCaptureRegex = try? NSRegularExpression(
    pattern: #"<invoke[^>]*name="([^"]+)""#,
    options: [.caseInsensitive]
  )
  static let invokeSingleQuoteCaptureRegex = try? NSRegularExpression(
    pattern: #"<invoke[^>]*name='([^']+)'"#,
    options: [.caseInsensitive]
  )
  static let parametersBlockCaptureRegex = try? NSRegularExpression(
    pattern: #"<parameters>([\s\S]*?)</parameters>"#,
    options: [.caseInsensitive]
  )
  static let jsonTagCaptureRegex = try? NSRegularExpression(
    pattern: #"<json>\s*([\s\S]*?)\s*</json>"#,
    options: [.caseInsensitive]
  )

  /// Pattern → precompiled regex. Keys must match call-site pattern strings
  /// exactly. No `NSRegularExpression(` here — constructions live on the
  /// `static let`s above so the ratchet sees them as hoisted.
  static let captureRegexByPattern: [String: NSRegularExpression] = {
    var map: [String: NSRegularExpression] = [:]
    if let regex = nameTagCaptureRegex {
      map[#"<name>\s*([^<]+?)\s*</name>"#] = regex
    }
    if let regex = toolNameJSONCaptureRegex {
      map[#""toolName"\s*:\s*"([^"]+)""#] = regex
    }
    if let regex = nameJSONCaptureRegex {
      map[#""name"\s*:\s*"([^"]+)""#] = regex
    }
    if let regex = stateTagCaptureRegex {
      map[#"<state>\s*([^<]+?)\s*</state>"#] = regex
    }
    if let regex = invokeDoubleQuoteCaptureRegex {
      map[#"<invoke[^>]*name="([^"]+)""#] = regex
    }
    if let regex = invokeSingleQuoteCaptureRegex {
      map[#"<invoke[^>]*name='([^']+)'"#] = regex
    }
    if let regex = parametersBlockCaptureRegex {
      map[#"<parameters>([\s\S]*?)</parameters>"#] = regex
    }
    if let regex = jsonTagCaptureRegex {
      map[#"<json>\s*([\s\S]*?)\s*</json>"#] = regex
    }
    return map
  }()
}
