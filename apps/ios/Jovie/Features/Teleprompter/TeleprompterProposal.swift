import Foundation
import SwiftUI

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

  var id: String {
    "video-proposal:\(kind.rawValue):\(title)"
  }
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

/// Chat card for a video-recording proposal. "Record in app" opens the
/// teleprompter overlay with the script pre-loaded (JOV-5075).
struct TeleprompterProposalCardView: View {
  let payload: MobileChatVideoProposalPayload
  let onRecord: (MobileChatVideoProposalPayload) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      HStack(alignment: .top, spacing: JovieSpacing.medium) {
        Image(systemName: "video.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(JovieColor.accentBlue)
          .frame(width: 20, height: 20)
          .padding(.top, 1)
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text(payload.title)
            .font(JovieFont.body(size: 15, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)

          Text(payload.kind.label)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)

          Text(payload.script)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textSecondary)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      Button {
        onRecord(payload)
      } label: {
        Text("Record in app")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: true))
      .accessibilityIdentifier("teleprompter-proposal-record")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.medium)
    .background(JovieColor.surface2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("teleprompter-proposal-card")
  }
}
