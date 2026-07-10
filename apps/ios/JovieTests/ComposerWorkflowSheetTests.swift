import Testing
import XCTest
@testable import Jovie

final class ComposerWorkflowSheetTests: XCTestCase {
  func testWorkflowActionsExposeCanonicalGridLabels() {
    let titles = ComposerWorkflowAction.allCases.map(\.title)
    XCTAssertEqual(
      titles,
      [
        "Make merch",
        "Smart link",
        "Camera",
        "Photo/file",
        "Release campaign",
        "Lyric video",
      ]
    )
  }

  func testWorkflowActionsProvideNonEmptyPrompts() {
    for action in ComposerWorkflowAction.allCases {
      XCTAssertFalse(action.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      XCTAssertFalse(action.systemImage.isEmpty)
      XCTAssertFalse(action.accessibilityIdentifier.isEmpty)
    }
  }

  func testWorkflowSheetHeightReservesStableFootprint() {
    XCTAssertGreaterThanOrEqual(ComposerWorkflowSheetHeight.estimated, 320)
  }
}

// MARK: - Slash palette pure logic (Swift Testing)

struct ComposerSlashPaletteTests {
  private let skills: [(id: String, label: String)] = [
    ("generateAlbumArt", "Generate album art"),
    ("proposeSocialLink", "Add social link"),
  ]

  // MARK: query(from:)

  @Test func queryIsNilForEmptyDraft() {
    #expect(ComposerSlashPalette.query(from: "") == nil)
  }

  @Test func queryIsEmptyStringForBareSlash() {
    #expect(ComposerSlashPalette.query(from: "/") == "")
  }

  @Test func queryReturnsTextAfterLeadingSlash() {
    #expect(ComposerSlashPalette.query(from: "/mer") == "mer")
  }

  @Test func queryIsNilForProse() {
    #expect(ComposerSlashPalette.query(from: "hello") == nil)
  }

  @Test func queryIsNilOnceWhitespaceFollowsTheSlash() {
    // Defined behavior: a space after the slash means prose, not a command.
    #expect(ComposerSlashPalette.query(from: "/ hi") == nil)
    #expect(ComposerSlashPalette.query(from: "/merch idea") == nil)
  }

  @Test func queryIsNilForCommittedSkillTokens() {
    #expect(ComposerSlashPalette.query(from: "/skill:generateAlbumArt") == nil)
    #expect(ComposerSlashPalette.query(from: "/skill:generateAlbumArt ") == nil)
  }

  // MARK: items(matching:skills:)

  @Test func emptyQueryReturnsAllWorkflowsThenAllSkillsInStableOrder() {
    let items = ComposerSlashPalette.items(matching: "", skills: skills)
    let expected: [ComposerSlashItem] =
      ComposerWorkflowAction.allCases.map(ComposerSlashItem.workflow)
        + skills.map { ComposerSlashItem.skill(id: $0.id, label: $0.label) }
    #expect(items == expected)
  }

  @Test func filteringMatchesWorkflowTitlesCaseInsensitively() {
    // "MER" hits "Make merch" and "Camera" (contains match), in allCases order.
    let items = ComposerSlashPalette.items(matching: "MER", skills: [])
    #expect(items == [.workflow(.makeMerch), .workflow(.camera)])
  }

  @Test func filteringMatchesSingleWorkflowSubset() {
    let items = ComposerSlashPalette.items(matching: "lyric", skills: skills)
    #expect(items == [.workflow(.lyricVideo)])
  }

  @Test func filteringMatchesSkillLabelsAndIds() {
    let byLabel = ComposerSlashPalette.items(matching: "album", skills: skills)
    #expect(byLabel == [.skill(id: "generateAlbumArt", label: "Generate album art")])

    let byID = ComposerSlashPalette.items(matching: "proposeSocial", skills: skills)
    #expect(byID == [.skill(id: "proposeSocialLink", label: "Add social link")])
  }

  @Test func skillsAreCappedAtEightPreservingLeadingOrder() {
    let many = (0..<12).map { (id: "skill\($0)", label: "Skill \($0)") }
    let items = ComposerSlashPalette.items(matching: "", skills: many)
    let skillItems = items.filter {
      if case .skill = $0 { return true } else { return false }
    }
    #expect(skillItems.count == ComposerSlashPalette.maxSkillItems)
    #expect(skillItems.first == .skill(id: "skill0", label: "Skill 0"))
    #expect(skillItems.last == .skill(id: "skill7", label: "Skill 7"))
  }

  @Test func noMatchesReturnsEmpty() {
    let items = ComposerSlashPalette.items(matching: "zzzzz", skills: skills)
    #expect(items.isEmpty)
  }

  // MARK: commit mapping

  @Test func committedDraftMapsSkillsToSkillTokensWithTrailingSpace() {
    let draft = ComposerSlashPalette.committedDraft(
      for: .skill(id: "generateAlbumArt", label: "Generate album art")
    )
    #expect(draft == "/skill:generateAlbumArt ")
    // A committed skill token must NOT re-open the palette.
    #expect(ComposerSlashPalette.query(from: draft ?? "") == nil)
  }

  @Test func committedDraftIsNilForWorkflows() {
    // Workflows commit through the existing onSelectWorkflow prompt path.
    #expect(ComposerSlashPalette.committedDraft(for: .workflow(.makeMerch)) == nil)
  }

  // MARK: default skills source

  @Test func defaultSkillsMirrorTheSharedLabelRegistrySortedByLabel() {
    let defaults = ComposerSlashPalette.defaultSkills
    #expect(defaults.count == MobileChatSkillLabels.registry.count)
    for (id, label) in defaults {
      #expect(MobileChatSkillLabels.registry[id] == label)
    }
    let labels = defaults.map(\.label)
    let sorted = labels.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    #expect(labels == sorted)
  }
}