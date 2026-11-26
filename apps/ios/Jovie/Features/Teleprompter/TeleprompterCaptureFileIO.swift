import Foundation

/// Disk helpers for teleprompter capture. Kept off the main actor so stop()
/// never blocks the UI thread on a synchronous FileManager call
/// (swift-arch `main-actor-sync-io`, JOV-10443).
enum TeleprompterCaptureFileIO {
  /// Returns whether a recorded video file exists at `url`.
  nonisolated static func videoExists(at url: URL) async -> Bool {
    await Task.detached(priority: .utility) {
      FileManager.default.fileExists(atPath: url.path)
    }.value
  }
}
