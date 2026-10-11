import Foundation
import SwiftUI

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
