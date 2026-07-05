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