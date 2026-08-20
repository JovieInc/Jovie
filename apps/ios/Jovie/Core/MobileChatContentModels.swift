import Foundation

enum MobileChatToolCallState: Equatable, Sendable {
  case running
  case succeeded
  case failed
}

struct MobileChatToolCallCardModel: Equatable, Identifiable, Sendable {
  let id: String
  let toolName: String
  let title: String
  let body: String?
  let state: MobileChatToolCallState
}

/// The four entity kinds understood by the chat wire format. Mirrors
/// `EntityKind` in apps/web/lib/chat/tokens.ts -- these are the only kinds
/// the model is instructed to emit. Any other `@kind:id[label]` token renders
/// verbatim as plain text (web parity), never as a chip.
enum MobileChatEntityKind: String, Equatable, Sendable {
  case release
  case artist
  case track
  case event
}

/// A single inline run within a prose text segment: either plain text or an
/// entity/skill mention that should render as an inline chip. Ported from the
/// `ChatToken` union in apps/web/lib/chat/tokens.ts. Positional index is
/// folded into the caller-assigned identity (see `MobileChatRenderableSegment`
/// prose run IDs) rather than a content hash, so segment identity doesn't
/// churn across re-renders of unrelated text.
enum MobileChatProseRun: Equatable, Sendable {
  case text(String)
  case entity(kind: MobileChatEntityKind, id: String, label: String)
  case skill(id: String, label: String)
}

/// Inline wrap units for a chat bubble. Contiguous text stays one flow so
/// SwiftUI/TextKit wrap like Messages. Entity chips are the only hard break;
/// skill labels stay in the same attributed string.
enum MobileChatFlowToken: Hashable, Sendable {
  case text(String)
  case entity(kind: MobileChatEntityKind, id: String, label: String)
  case skill(id: String, label: String)

  var isEntityChip: Bool {
    if case .entity = self { return true }
    return false
  }
}

/// Builds the attributed bubble string the transcript actually renders.
/// Word-splitting here is what detached the first word ("Yo", "Jovie") into
/// its own column — keep one text flow unless a chip must break the run.
enum MobileChatBubbleText {
  static func wrapUnits(from runs: [MobileChatProseRun]) -> [MobileChatFlowToken] {
    var tokens: [MobileChatFlowToken] = []
    for run in runs {
      switch run {
      case let .text(value):
        guard !value.isEmpty else { continue }
        if case let .text(existing) = tokens.last {
          tokens[tokens.count - 1] = .text(existing + value)
        } else {
          tokens.append(.text(value))
        }
      case let .entity(kind, id, label):
        tokens.append(.entity(kind: kind, id: id, label: label))
      case let .skill(id, label):
        tokens.append(.skill(id: id, label: label))
      }
    }
    return tokens
  }

  static func attributedText(from tokens: [MobileChatFlowToken]) -> AttributedString {
    var result = AttributedString()
    for token in tokens {
      switch token {
      case let .text(value):
        guard !value.isEmpty else { continue }
        result += AttributedString(value)
      case let .skill(_, label):
        var skill = AttributedString(label)
        skill.inlinePresentationIntent = .stronglyEmphasized
        result += skill
      case .entity:
        continue
      }
    }
    return result
  }

  static func attributedText(from runs: [MobileChatProseRun]) -> AttributedString {
    attributedText(from: wrapUnits(from: runs))
  }
}

enum MobileChatMerchArtifact: Equatable, Identifiable, Sendable {
  case productOptions(MobileChatMerchOptionsPayload)
  case designCarousel(MobileChatMerchDesignsPayload)

  var id: String {
    switch self {
    case let .productOptions(payload):
      return "merch-options:\(payload.generationId)"
    case let .designCarousel(payload):
      return "merch-designs:\(payload.generationId)"
    }
  }
}

struct MobileChatMerchOptionsPayload: Equatable, Sendable {
  let generationId: String
  let nextStep: String?
  let options: [MobileChatMerchOptionCard]
}

struct MobileChatMerchOptionCard: Equatable, Identifiable, Sendable {
  let id: String
  let optionNumber: Int
  let designName: String
  let productLabel: String
  let colorway: String?
  let concept: String
  let mockupURL: URL?
  let salePrice: String?
}

struct MobileChatMerchDesignsPayload: Equatable, Sendable {
  let generationId: String
  let nextStep: String?
  let designs: [MobileChatMerchDesignCard]
}

struct MobileChatMerchDesignCard: Equatable, Identifiable, Sendable {
  let id: String
  let optionNumber: Int
  let designName: String
  let concept: String
  let previewURL: URL?
  let isReady: Bool
}

enum MobileChatRenderableSegment: Equatable, Identifiable, Sendable {
  case text(runs: [MobileChatProseRun])
  case toolCall(MobileChatToolCallCardModel)
  case merchArtifact(MobileChatMerchArtifact)
  case videoProposal(MobileChatVideoProposalPayload)

  var id: String {
    switch self {
    case let .text(runs):
      return "text:\(runs.count):\(Self.identitySeed(for: runs))"
    case let .toolCall(model):
      return model.id
    case let .merchArtifact(artifact):
      return artifact.id
    case let .videoProposal(payload):
      return payload.id
    }
  }

  /// Cheap, positional identity seed. Avoids `String.hashValue`, which is
  /// randomized per process launch and therefore unstable across app runs --
  /// using it as a stable SwiftUI identity was the pre-JOV-3608 bug: IDs
  /// could collide or needlessly churn as streaming deltas mutated content.
  private static func identitySeed(for runs: [MobileChatProseRun]) -> String {
    runs.prefix(4).map { run -> String in
      switch run {
      case let .text(text):
        return "t\(text.count)"
      case let .entity(kind, id, _):
        return "e:\(kind.rawValue):\(id)"
      case let .skill(id, _):
        return "s:\(id)"
      }
    }.joined(separator: "|")
  }
}
