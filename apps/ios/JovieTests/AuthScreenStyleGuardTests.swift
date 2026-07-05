import Foundation
import Testing

struct AuthScreenStyleGuardTests {
  @Test func continueInBrowserLoadingSpinnerUsesNeutralForeground() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Features/Auth/AuthScreen.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    let buttonStart = try #require(source.range(of: "private struct ContinueInBrowserButton: View"))
    let buttonEnd = try #require(source.range(of: "private struct AuthErrorText: View"))
    let buttonSource = source[buttonStart.lowerBound..<buttonEnd.lowerBound]

    #expect(buttonSource.contains(".tint(JovieColor.backgroundBase)"))
    #expect(!buttonSource.contains(".tint(JovieColor.accentBlue)"))
  }
}
