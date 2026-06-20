import Foundation
import Testing
@testable import Jovie

struct DashboardViewGodViewGuardTests {
  private let dashboardRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("Jovie/Features/Dashboard")

  @Test func dashboardSurfaceStaysDecomposed() throws {
    let limits: [(String, Int)] = [
      ("DashboardView.swift", PerformanceBudgets.dashboardViewMaxLines),
      ("DashboardAvatarView.swift", PerformanceBudgets.dashboardAvatarViewMaxLines),
      ("QRCodeCardView.swift", PerformanceBudgets.qrCodeCardViewMaxLines),
      ("DashboardAppleWallet.swift", PerformanceBudgets.dashboardAppleWalletMaxLines),
    ]

    for (fileName, maxLines) in limits {
      let fileURL = dashboardRoot.appendingPathComponent(fileName)
      let source = try String(contentsOf: fileURL, encoding: .utf8)
      let lineCount = source.split(whereSeparator: \.isNewline).count

      #expect(
        lineCount <= maxLines,
        "\(fileName) has \(lineCount) lines; max \(maxLines). Split the god-view instead of growing one file."
      )
    }
  }
}