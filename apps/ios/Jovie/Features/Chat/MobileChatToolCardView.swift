import SwiftUI

struct MobileChatToolCardView: View {
  let model: MobileChatToolCallCardModel

  var body: some View {
    HStack(alignment: .top, spacing: JovieSpacing.medium) {
      Image(systemName: iconName)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(iconColor)
        .frame(width: 20, height: 20)
        .padding(.top, 1)

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(model.title)
          .font(JovieFont.body(size: 15, weight: .semibold))
          .foregroundStyle(titleColor)
          .fixedSize(horizontal: false, vertical: true)

        if let body = model.body {
          Text(body)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.medium)
    .background(JovieColor.surface2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier("mobile-chat-tool-card")
  }

  private var iconName: String {
    switch model.state {
    case .running:
      return "ellipsis.circle"
    case .succeeded:
      return "checkmark.circle.fill"
    case .failed:
      return "exclamationmark.circle.fill"
    }
  }

  private var iconColor: Color {
    switch model.state {
    case .running:
      return JovieColor.textTertiary
    case .succeeded:
      return JovieColor.accentBlue
    case .failed:
      return JovieColor.errorText
    }
  }

  private var titleColor: Color {
    switch model.state {
    case .failed:
      return JovieColor.errorText
    default:
      return JovieColor.textPrimary
    }
  }

  private var accessibilityLabel: String {
    if let body = model.body {
      return "\(model.title). \(body)"
    }
    return model.title
  }
}