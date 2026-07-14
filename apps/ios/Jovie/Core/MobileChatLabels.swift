import Foundation

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

/// Human-facing labels for `/skill:id` tokens. Mirrors the `COMMANDS` skill
/// registry in apps/web/lib/commands/registry.ts. Kept as a small static
/// table (not derived from the tool-card registry above, which is keyed by a
/// different vocabulary and only covers a subset of skills) so this stays a
/// pure, direct port of the web source of truth.
enum MobileChatSkillLabels {
  static let registry: [String: String] = [
    "generateAlbumArt": "Generate album art",
    "generateReleasePitch": "Generate pitch",
    "proposeAvatarUpload": "Change profile photo",
    "proposeSocialLink": "Add social link",
    "proposeSocialLinkRemoval": "Remove social link",
    "submitFeedback": "Send feedback",
  ]

  /// Fallback for skill ids not yet in the registry (e.g. a newly shipped
  /// web skill the app hasn't been updated to know about): humanize the
  /// camelCase id into Title Case words, e.g. `someFutureSkillId` ->
  /// "Some Future Skill Id".
  static func label(for id: String) -> String {
    if let known = registry[id] {
      return known
    }

    guard !id.isEmpty else { return id }

    let spaced = id.replacingOccurrences(
      of: "([a-z0-9])([A-Z])",
      with: "$1 $2",
      options: .regularExpression
    )
    return spaced.capitalized
  }
}
