import Foundation

/// Recordable video kinds understood by the chat wire format. Mirrors
/// `RECORDABLE_VIDEO_KINDS` in apps/web/lib/teleprompter/types.ts.
enum MobileChatVideoKind: String, Equatable, Sendable, CaseIterable {
  case promo
  case thankYou = "thank_you"
  case bts

  var label: String {
    switch self {
    case .promo: return "Promo video"
    case .thankYou: return "Thank-you video"
    case .bts: return "Behind-the-scenes video"
    }
  }
}

/// Parsed `proposeVideoRecording` tool result. Mirrors
/// `VideoRecordingProposalPayload` in apps/web/lib/teleprompter/types.ts --
/// this is the Jovie context that proposes a recording; its script auto-loads
/// into the teleprompter overlay (JOV-5075).
struct MobileChatVideoProposalPayload: Equatable, Identifiable, Sendable {
  let kind: MobileChatVideoKind
  let title: String
  let script: String
  let prompt: String?
  let initialContentMode: TeleprompterContentMode

  init(
    kind: MobileChatVideoKind,
    title: String,
    script: String,
    prompt: String? = nil,
    initialContentMode: TeleprompterContentMode = .script
  ) {
    self.kind = kind
    self.title = title
    self.script = script
    self.prompt = prompt
    self.initialContentMode = initialContentMode
  }

  var id: String {
    "video-proposal:\(kind.rawValue):\(title)"
  }

  /// One-tap, network-free entry for founder dogfooding. Chat proposals keep
  /// their script-first default; a quick vlog opens on the canonical Prompt
  /// composition so the creator can start from one concise question.
  static let quickVlog = MobileChatVideoProposalPayload(
    kind: .bts,
    title: "Quick Vlog",
    script: "What do you want to share?",
    prompt: "What do you want to share?",
    initialContentMode: .prompt
  )
}

extension MobileChatContentParser {
  static let videoProposalToolNames: Set<String> = [
    "proposeVideoRecording",
  ]

  /// Decodes a `proposeVideoRecording` tool-result JSON payload. Tolerates a
  /// missing/unknown `showcaseVariant` (the iOS overlay has no showcase gate).
  static func decodeVideoProposal(from data: Data) -> MobileChatVideoProposalPayload? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }

    guard (object["success"] as? Bool) == true else { return nil }
    guard
      let kindRaw = object["kind"] as? String,
      let kind = MobileChatVideoKind(rawValue: kindRaw)
    else {
      return nil
    }
    guard let title = object["title"] as? String, !title.isEmpty else { return nil }
    guard let script = object["script"] as? String, !script.isEmpty else { return nil }

    return MobileChatVideoProposalPayload(kind: kind, title: title, script: script)
  }
}

enum TeleprompterContentMode: String, Equatable, Sendable, CaseIterable {
  case script
  case prompt
}
