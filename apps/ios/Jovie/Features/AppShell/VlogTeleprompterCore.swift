import Foundation

enum KaraokeAlignment: String, Codable, Equatable, Sendable {
  case aligned
  case offScript
  case manual
}

struct KaraokeScriptFollower: Equatable, Sendable {
  private(set) var displayWords: [String]
  private(set) var nextWordIndex: Int
  private(set) var alignment: KaraokeAlignment

  private let normalizedWords: [String]
  private var lastTranscriptWords: [String] = []
  private var unmatchedRun = 0

  init(script: String) {
    let scriptWords = script
      .split(whereSeparator: { $0.isWhitespace })
      .map(String.init)
    let spokenWords = scriptWords.compactMap { word -> (display: String, normalized: String)? in
      let normalized = Self.normalizeWord(word)
      return normalized.isEmpty ? nil : (word, normalized)
    }
    displayWords = spokenWords.map(\.display)
    normalizedWords = spokenWords.map(\.normalized)
    nextWordIndex = 0
    alignment = .aligned
  }

  var progress: Double {
    guard !displayWords.isEmpty else { return 0 }
    return Double(nextWordIndex) / Double(displayWords.count)
  }

  mutating func ingest(transcript: String) {
    let transcriptWords = Self.normalizedWords(in: transcript)
    guard !transcriptWords.isEmpty, !normalizedWords.isEmpty else { return }

    let sharedPrefixCount = zip(lastTranscriptWords, transcriptWords)
      .prefix(while: { $0 == $1 })
      .count
    let newWords = transcriptWords.dropFirst(sharedPrefixCount)

    for word in newWords {
      // After divergence, a coincidental single script word inside a rant must
      // not advance the prompt. The stronger suffix match below re-aligns it.
      if alignment != .offScript,
         nextWordIndex < normalizedWords.count,
         word == normalizedWords[nextWordIndex]
      {
        nextWordIndex += 1
        unmatchedRun = 0
        alignment = .aligned
      } else if nextWordIndex > 0, word == normalizedWords[nextWordIndex - 1] {
        // Speech partials commonly repeat or revise the most recent word.
      } else {
        unmatchedRun += 1
        if unmatchedRun >= 2 {
          alignment = .offScript
        }
      }
    }

    if let recoveredIndex = recoveryIndex(in: transcriptWords) {
      nextWordIndex = recoveredIndex
      unmatchedRun = 0
      alignment = .aligned
    }

    lastTranscriptWords = transcriptWords
  }

  mutating func previewSeek(to index: Int) {
    nextWordIndex = clamped(index)
    alignment = .manual
    unmatchedRun = 0
  }

  mutating func resume(at index: Int) {
    nextWordIndex = clamped(index)
    alignment = .aligned
    unmatchedRun = 0
    // Apple Speech partials are cumulative. Preserve the transcript anchor so
    // the next partial only contributes words spoken after this manual resume.
  }

  private func recoveryIndex(in transcriptWords: [String]) -> Int? {
    let requiredLength = alignment == .aligned ? 2 : 3
    let maximumLength = min(6, transcriptWords.count)
    guard maximumLength >= requiredLength else { return nil }

    let searchStart = max(0, nextWordIndex - 4)
    for matchLength in stride(from: maximumLength, through: requiredLength, by: -1) {
      let suffix = Array(transcriptWords.suffix(matchLength))
      let searchEnd = min(
        normalizedWords.count - matchLength,
        nextWordIndex + 80
      )
      guard searchEnd >= searchStart else { continue }

      var bestStart: Int?
      for scriptStart in searchStart...searchEnd {
        let scriptEnd = scriptStart + matchLength
        if Array(normalizedWords[scriptStart..<scriptEnd]) == suffix {
          if bestStart == nil || abs(scriptStart - nextWordIndex) < abs(bestStart! - nextWordIndex) {
            bestStart = scriptStart
          }
        }
      }

      if let bestStart {
        return bestStart + matchLength
      }
    }

    return nil
  }

  private func clamped(_ index: Int) -> Int {
    min(max(index, 0), displayWords.count)
  }

  private static func normalizedWords(in text: String) -> [String] {
    text
      .lowercased()
      .components(separatedBy: CharacterSet.alphanumerics.inverted)
      .filter { !$0.isEmpty }
  }

  private static func normalizeWord(_ word: String) -> String {
    normalizedWords(in: word).first ?? ""
  }
}

struct VlogWordTiming: Codable, Equatable, Sendable {
  let word: String
  let startSeconds: TimeInterval
  let durationSeconds: TimeInterval
  let confidence: Float
}

enum VlogSessionStatus: String, Codable, Equatable, Sendable {
  case recording
  case completed
  case failed
}

struct VlogSessionRecord: Codable, Equatable, Identifiable, Sendable {
  let id: UUID
  let scriptID: UUID
  let scriptTitle: String
  let scriptText: String
  let videoFilename: String
  let createdAt: Date
  var endedAt: Date?
  var transcript: String
  var segments: [VlogWordTiming]
  var status: VlogSessionStatus
  let storageMode: String
}

struct VlogPromptFeedbackRecord: Codable, Equatable, Identifiable, Sendable {
  let id: UUID
  let proposalID: String
  let feedback: String
  let createdAt: Date
  let storageMode: String
}

struct VlogSessionStore: Sendable {
  let rootURL: URL

  static func localDocuments(fileManager: FileManager = .default) -> VlogSessionStore {
    let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return VlogSessionStore(rootURL: documents.appendingPathComponent("JovieVlogs", isDirectory: true))
  }

  func create(scriptTitle: String, scriptText: String) throws -> (VlogSessionRecord, URL) {
    let sessionID = UUID()
    let directory = rootURL.appendingPathComponent(sessionID.uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

    let record = VlogSessionRecord(
      id: sessionID,
      scriptID: UUID(),
      scriptTitle: scriptTitle,
      scriptText: scriptText,
      videoFilename: "recording.mov",
      createdAt: Date(),
      endedAt: nil,
      transcript: "",
      segments: [],
      status: .recording,
      storageMode: "local_only_no_upload"
    )
    try save(record)
    return (record, directory.appendingPathComponent(record.videoFilename))
  }

  func save(_ record: VlogSessionRecord) throws {
    let directory = rootURL.appendingPathComponent(record.id.uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(record)
    try data.write(to: directory.appendingPathComponent("session.json"), options: .atomic)
  }

  func load(id: UUID) throws -> VlogSessionRecord {
    let url = rootURL
      .appendingPathComponent(id.uuidString, isDirectory: true)
      .appendingPathComponent("session.json")
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let data = try handle.readToEnd() ?? Data()
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(VlogSessionRecord.self, from: data)
  }

  func recent(limit: Int = 20) -> [VlogSessionRecord] {
    guard let directories = try? FileManager.default.contentsOfDirectory(
      at: rootURL,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) else {
      return []
    }

    return directories.compactMap { directory in
      guard let id = UUID(uuidString: directory.lastPathComponent) else { return nil }
      return try? load(id: id)
    }
    .sorted { $0.createdAt > $1.createdAt }
    .prefix(limit)
    .map { $0 }
  }

  func queuePromptFeedback(
    proposalID: String,
    feedback: String
  ) throws -> VlogPromptFeedbackRecord {
    let record = VlogPromptFeedbackRecord(
      id: UUID(),
      proposalID: proposalID,
      feedback: feedback,
      createdAt: Date(),
      storageMode: "local_only_no_upload"
    )
    let directory = rootURL.appendingPathComponent("PromptFeedback", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(record)
    try data.write(
      to: directory.appendingPathComponent("\(record.id.uuidString).json"),
      options: .atomic
    )
    return record
  }

  func queuedPromptFeedback() -> [VlogPromptFeedbackRecord] {
    let directory = rootURL.appendingPathComponent("PromptFeedback", isDirectory: true)
    guard let files = try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) else {
      return []
    }

    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return files.compactMap { file in
      guard let handle = try? FileHandle(forReadingFrom: file) else { return nil }
      defer { try? handle.close() }
      guard let data = try? handle.readToEnd() else { return nil }
      return try? decoder.decode(VlogPromptFeedbackRecord.self, from: data)
    }
    .sorted { $0.createdAt > $1.createdAt }
  }

  func videoURL(for record: VlogSessionRecord) -> URL {
    rootURL
      .appendingPathComponent(record.id.uuidString, isDirectory: true)
      .appendingPathComponent(record.videoFilename)
  }

  func metadataURL(for record: VlogSessionRecord) -> URL {
    rootURL
      .appendingPathComponent(record.id.uuidString, isDirectory: true)
      .appendingPathComponent("session.json")
  }
}
