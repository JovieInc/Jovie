import SwiftUI

enum ComposerWorkflowAction: String, CaseIterable, Identifiable {
  case makeMerch
  case smartLink
  case camera
  case photoFile
  case releaseCampaign
  case lyricVideo

  var id: String { rawValue }

  var title: String {
    switch self {
    case .makeMerch:
      return "Make merch"
    case .smartLink:
      return "Smart link"
    case .camera:
      return "Camera"
    case .photoFile:
      return "Photo/file"
    case .releaseCampaign:
      return "Release campaign"
    case .lyricVideo:
      return "Lyric video"
    }
  }

  var systemImage: String {
    switch self {
    case .makeMerch:
      return "tshirt"
    case .smartLink:
      return "link"
    case .camera:
      return "camera"
    case .photoFile:
      return "photo.on.rectangle.angled"
    case .releaseCampaign:
      return "calendar.badge.clock"
    case .lyricVideo:
      return "play.rectangle"
    }
  }

  var prompt: String {
    switch self {
    case .makeMerch:
      return "Make merch for my latest release."
    case .smartLink:
      return "Help me set up a smart link for my release."
    case .camera:
      return "I want to take a photo for my release."
    case .photoFile:
      return "I want to upload a photo or file."
    case .releaseCampaign:
      return "Help me plan a release campaign."
    case .lyricVideo:
      return "Generate a lyric video for my latest release."
    }
  }

  var accessibilityIdentifier: String {
    "composer-workflow-\(rawValue)"
  }
}

struct ComposerWorkflowSheet: View {
  let onSelect: (ComposerWorkflowAction) -> Void

  private let columns = [
    GridItem(.flexible(), spacing: JovieSpacing.medium),
    GridItem(.flexible(), spacing: JovieSpacing.medium),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      Capsule()
        .fill(JovieColor.borderDefault)
        .frame(width: 36, height: 4)
        .frame(maxWidth: .infinity)

      Text("Start a workflow")
        .font(JovieFont.body(size: 15, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)

      LazyVGrid(columns: columns, spacing: JovieSpacing.medium) {
        ForEach(ComposerWorkflowAction.allCases) { action in
          Button {
            onSelect(action)
          } label: {
            ComposerWorkflowTile(action: action)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(action.title)
          .accessibilityIdentifier(action.accessibilityIdentifier)
        }
      }
    }
    .padding(.horizontal, JovieSpacing.xLarge)
    .padding(.top, JovieSpacing.medium)
    .padding(.bottom, JovieSpacing.xLarge)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(JovieColor.surface0)
    .accessibilityIdentifier("composer-workflow-sheet")
    .accessibilityAddTraits(.isModal)
  }
}

private struct ComposerWorkflowTile: View {
  let action: ComposerWorkflowAction

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Image(systemName: action.systemImage)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .frame(width: 36, height: 36)
        .background(JovieColor.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

      Text(action.title)
        .font(JovieFont.body(size: 14, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .multilineTextAlignment(.leading)
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
  }
}

enum ComposerWorkflowSheetHeight {
  static let estimated: CGFloat = 360
}
