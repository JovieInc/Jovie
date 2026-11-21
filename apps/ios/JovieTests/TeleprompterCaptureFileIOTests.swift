import Foundation
import Testing
@testable import Jovie

@Suite("TeleprompterCaptureFileIO")
struct TeleprompterCaptureFileIOTests {
  @Test func videoExistsReportsPresentAndMissingFiles() async throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("jovie-teleprompter-file-io-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }

    let present = directory.appendingPathComponent("clip.mov")
    let missing = directory.appendingPathComponent("absent.mov")
    try Data([0x00]).write(to: present)

    #expect(await TeleprompterCaptureFileIO.videoExists(at: present))
    #expect(!(await TeleprompterCaptureFileIO.videoExists(at: missing)))
  }
}
