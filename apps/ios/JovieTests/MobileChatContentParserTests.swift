import Foundation
import SwiftUI
import Testing
import UIKit
@testable import Jovie

struct MobileChatContentParserTests {
  @Test func parsesToolCallIntoCardAndSuppressesRawMarkup() {
    let content = """
    Here are some ideas.
    <tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName><artistGenres>pop, electronic</artistGenres><releaseContext>All This Noise EP and remixes</releaseContext></parameters></tool_call>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments.count == 2)
    #expect(segments[0] == .text(runs: [.text("Here are some ideas.")]))

    guard case let .toolCall(model) = segments[1] else {
      Issue.record("Expected tool call segment")
      return
    }

    #expect(model.toolName == "createMerch")
    #expect(model.title == "Creating merch options…")
    #expect(model.body == "Tim White · pop, electronic")
    #expect(model.state == .running)
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == "Here are some ideas.")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).contains("<tool_call>") == false)
  }

  @Test func suppressesIncompleteToolCallWhileStreaming() {
    let content = "Working on it <tool_call><name>createMerch</name><parameters><artistName>Tim"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments.count == 2)
    #expect(segments[0] == .text(runs: [.text("Working on it")]))
    guard case let .toolCall(model) = segments[1] else {
      Issue.record("Expected partial tool call segment")
      return
    }
    #expect(model.toolName == "createMerch")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: true) == "Working on it")
  }

  @Test func marksFailedToolResultState() {
    let content = """
    <tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName></parameters></tool_call>
    <tool_result><name>createMerch</name><state>failed</state><message>Denied by user</message></tool_result>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    guard case let .toolCall(model) = segments.first else {
      Issue.record("Expected tool call segment")
      return
    }

    #expect(model.state == .failed)
    #expect(model.title == "Couldn't create merch")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).isEmpty)
  }

  @Test func qualityEvalHidesRawEntitySkillAndToolMarkup() {
    let content = """
    Check @release:rel_1[Midnight Drive] and /skill:merch then
    <tool_call><name>createMerch</name><parameters></parameters></tool_call>
    """
    let display = MobileChatContentParser.displayText(from: content, isStreaming: false)
    #expect(display.contains("@release:") == false)
    #expect(display.contains("/skill:") == false)
    #expect(display.contains("<tool_call>") == false)
    #expect(display.contains("Midnight Drive"))
  }

  @Test func leavesPlainTextUntouched() {
    let content = "Just a normal assistant reply."

    #expect(
      MobileChatContentParser.segments(from: content, isStreaming: false) == [.text(runs: [.text(content)])]
    )
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == content)
  }

  @Test func parsesFunctionCallsDialectIntoCardAndSuppressesRawMarkup() {
    let content = """
    Here are some ideas.
    <function_calls><invoke name="createMerch"><parameter name="productType">hoodie</parameter><parameter name="artistName">Tim White</parameter><parameter name="artistGenres">pop, electronic</parameter></invoke></function_calls>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments.count == 2)
    #expect(segments[0] == .text(runs: [.text("Here are some ideas.")]))

    guard case let .toolCall(model) = segments[1] else {
      Issue.record("Expected tool call segment")
      return
    }

    #expect(model.toolName == "createMerch")
    #expect(model.title == "Creating merch options…")
    #expect(model.body == "Tim White · hoodie")
    #expect(model.state == .running)
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == "Here are some ideas.")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).contains("<function_calls>") == false)
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).contains("<invoke") == false)
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).contains("<parameter") == false)
  }

  @Test func suppressesFunctionResultJsonDump() {
    let content = """
    <function_calls><invoke name="createMerch"><parameter name="productType">hoodie</parameter></invoke></function_calls>
    <function_result>{"title":"Digital Noise Hoodie","price":46,"mockupUrl":"https://example.com/mockup.png"}</function_result>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    guard case let .toolCall(model) = segments.first else {
      Issue.record("Expected tool call segment")
      return
    }

    #expect(model.toolName == "createMerch")
    #expect(model.state == .succeeded)
    #expect(model.title == "Merch options ready")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).isEmpty)
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).contains("mockupUrl") == false)
  }

  @Test func suppressesUnknownToolMarkupDialect() {
    let content = """
    Before
    <custom_tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName></parameters></custom_tool_call>
    After
    """

    let displayText = MobileChatContentParser.displayText(from: content, isStreaming: false)
    #expect(displayText == "Before\n\nAfter")
    #expect(displayText.contains("<custom_tool_call>") == false)
    #expect(displayText.contains("<name>") == false)
  }

  @Test func suppressesIncompleteFunctionCallsWhileStreaming() {
    let content = "Working on it <function_calls><invoke name=\"createMerch\"><parameter name=\"productType\">hood"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments.count == 2)
    #expect(segments[0] == .text(runs: [.text("Working on it")]))
    guard case let .toolCall(model) = segments[1] else {
      Issue.record("Expected partial tool call segment")
      return
    }
    #expect(model.toolName == "createMerch")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: true) == "Working on it")
  }

  @Test func hydratesMerchArtifactsAndSuppressesDuplicateMarkdown() {
    let merchJSON =
      #"{"success":true,"generationId":"gen-1","options":[{"id":"opt-1","option_number":1,"design_name":"Neon Pulse Tee","product_type":"Tee","concept":"Bold neon typography.","mockup_urls":["https://cdn.test/neon.jpg"],"price_recommendation":{"sale_price":"$45.00"}}]}"#
    let content = """
    **1. Neon Pulse Tee** — bold neon typography.
    <tool_call><name>createMerch</name><parameters></parameters></tool_call>
    <tool_result><name>createMerch</name><state>success</state><json>\(merchJSON)</json></tool_result>
    """

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    let hasText = segments.contains { if case .text = $0 { return true } else { return false } }

    #expect(!hasText)
    #expect(MobileChatContentParser.sanitizeMerchEnumerationProse("**1. Neon Pulse Tee**").isEmpty)

    guard case let .merchArtifact(.productOptions(payload)) = segments.last else {
      Issue.record("Expected merch options artifact")
      return
    }
    #expect(payload.options[0].designName == "Neon Pulse Tee")
    #expect(payload.options[0].salePrice == "$45.00")
  }

  @Test func hydratesMerchDesignCarouselFromToolResultJson() {
    let content = #"<tool_call><name>previewMerchOptions</name><parameters></parameters></tool_call><tool_result><name>previewMerchOptions</name><state>success</state><json>{"success":true,"generationId":"gen-2","designs":[{"id":"d-1","option_number":1,"design_name":"Mono Mark","concept":"Minimal line art.","status":"ready","preview_url":"https://cdn.test/mono.png"}]}</json></tool_result>"#

    guard case let .merchArtifact(.designCarousel(payload)) = MobileChatContentParser
      .segments(from: content, isStreaming: false).last
    else {
      Issue.record("Expected design carousel artifact")
      return
    }
    #expect(payload.designs[0].designName == "Mono Mark")
    #expect(payload.designs[0].isReady)
  }

  @Test func hydratesVideoProposalFromToolResultJson() {
    let content = #"<tool_call><name>proposeVideoRecording</name><parameters></parameters></tool_call><tool_result><name>proposeVideoRecording</name><state>success</state><json>{"success":true,"kind":"promo","title":"Release day shout-out","script":"Hey, my new single is out today.","showcaseVariant":"direct","label":"Promo video"}</json></tool_result>"#

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    guard case let .videoProposal(payload) = segments.last else {
      Issue.record("Expected video proposal segment")
      return
    }
    #expect(payload.kind == .promo)
    #expect(payload.title == "Release day shout-out")
    #expect(payload.script == "Hey, my new single is out today.")
    #expect(payload.id == "video-proposal:promo:Release day shout-out")
  }

  @Test func skipsVideoProposalWhenToolResultFailed() {
    let content = #"<tool_call><name>proposeVideoRecording</name><parameters></parameters></tool_call><tool_result><name>proposeVideoRecording</name><state>failed</state><json>{"success":false}</json></tool_result>"#

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(!segments.contains { if case .videoProposal = $0 { return true } else { return false } })
  }

  @Test func rejectsVideoProposalWithUnknownKind() {
    let data = #"{"success":true,"kind":"tutorial","title":"T","script":"Some script text."}"#
      .data(using: .utf8)!

    #expect(MobileChatContentParser.decodeVideoProposal(from: data) == nil)
  }

  @Test func allComponentsFixtureWireParsesToCardsWithoutRawMarkup() {
    let running = MobileChatContentParser.segments(
      from: MobileChatAllComponentsFixture.runningToolCall,
      isStreaming: false
    )
    guard case let .toolCall(runningModel) = running.first else {
      Issue.record("Expected running tool card from fixture wire")
      return
    }
    #expect(runningModel.state == .running)
    #expect(runningModel.title == "Creating merch options…")
    #expect(
      MobileChatContentParser.displayText(
        from: MobileChatAllComponentsFixture.runningToolCall,
        isStreaming: false
      ).contains("<tool_call>") == false
    )

    let failed = MobileChatContentParser.segments(
      from: MobileChatAllComponentsFixture.failedToolCall,
      isStreaming: false
    )
    guard case let .toolCall(failedModel) = failed.first else {
      Issue.record("Expected failed tool card from fixture wire")
      return
    }
    #expect(failedModel.state == .failed)
    #expect(failedModel.title == "Couldn't create merch")

    let merch = MobileChatContentParser.segments(
      from: MobileChatAllComponentsFixture.merchProductOptions,
      isStreaming: false
    )
    #expect(
      merch.contains {
        if case let .toolCall(model) = $0 {
          return model.state == .succeeded && model.title == "Merch options ready"
        }
        return false
      }
    )
    guard case let .merchArtifact(.productOptions(payload)) = merch.last else {
      Issue.record("Expected merch product options from fixture wire")
      return
    }
    #expect(payload.options[0].designName == "Neon Pulse Tee")

    let carousel = MobileChatContentParser.segments(
      from: MobileChatAllComponentsFixture.merchDesignCarousel,
      isStreaming: false
    )
    guard case let .merchArtifact(.designCarousel(designs)) = carousel.last else {
      Issue.record("Expected merch design carousel from fixture wire")
      return
    }
    #expect(designs.designs[0].designName == "Mono Mark")

    let video = MobileChatContentParser.segments(
      from: MobileChatAllComponentsFixture.videoProposal,
      isStreaming: false
    )
    guard case let .videoProposal(proposal) = video.last else {
      Issue.record("Expected video proposal from fixture wire")
      return
    }
    #expect(proposal.title == "Release day shout-out")

    let assistantDisplay = MobileChatContentParser.displayText(
      from: MobileChatAllComponentsFixture.assistantProse,
      isStreaming: false
    )
    #expect(assistantDisplay.contains("@release:") == false)
    #expect(assistantDisplay.contains("/skill:") == false)
    #expect(assistantDisplay.contains("Midnight Drive"))
    #expect(assistantDisplay.contains("Opus"))
    #expect(assistantDisplay.contains("Coachella 2027"))
    #expect(assistantDisplay.contains("Generate album art"))

    let userDisplay = MobileChatContentParser.displayText(
      from: MobileChatAllComponentsFixture.userProse,
      isStreaming: false
    )
    #expect(userDisplay.contains("Porter Robinson"))
    #expect(userDisplay.contains("@artist:") == false)

    #expect(MobileChatContentParser.segments(from: "", isStreaming: true).isEmpty)
    #expect(MobileChatAllComponentsFixture.default.contains { $0.status == .failed })
    #expect(MobileChatAllComponentsFixture.default.contains { $0.requiresWebHandoff })
    #expect(
      MobileChatAllComponentsFixture.default.contains {
        $0.status == .streaming && $0.content.isEmpty
      }
    )
  }

}

// MARK: - Entity + skill token parsing (JOV-3608)

struct MobileChatEntityTokenParsingTests {
  @Test func parsesEntityMentionIntoChipRun() {
    let content = "Check out @release:rel_1[Midnight Drive] today"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .text("Check out "),
        .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
        .text(" today"),
      ]),
    ])
  }

  @Test func parsesAllFourEntityKinds() {
    let content =
      "@release:rel_1[R] @artist:art_1[A] @track:trk_1[T] @event:evt_1[E]"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .entity(kind: .release, id: "rel_1", label: "R"),
        .text(" "),
        .entity(kind: .artist, id: "art_1", label: "A"),
        .text(" "),
        .entity(kind: .track, id: "trk_1", label: "T"),
        .text(" "),
        .entity(kind: .event, id: "evt_1", label: "E"),
      ]),
    ])
  }

  @Test func parsesSkillTokenIntoChipRunWithKnownLabel() {
    let content = "Try /skill:generateAlbumArt now"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .text("Try "),
        .skill(id: "generateAlbumArt", label: "Generate album art"),
        .text(" now"),
      ]),
    ])
  }

  @Test func humanizesUnknownSkillIdAsFallbackLabel() {
    let content = "/skill:someFutureSkillId"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .skill(id: "someFutureSkillId", label: "Some Future Skill Id"),
      ]),
    ])
  }

  @Test func rendersUnknownEntityKindVerbatimAsText() {
    let content = "@unknown:x[Y] stays as text"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [.text("@unknown:x[Y] stays as text")]),
    ])
  }

  @Test func unescapesBracketsInEntityLabels() {
    let content = "@track:trk_1[Live at Brooklyn Steel [2026\\]]"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .entity(kind: .track, id: "trk_1", label: "Live at Brooklyn Steel [2026]"),
      ]),
    ])
  }

  @Test func truncatesOversizedEntityLabelWithEllipsisForOneLineChipDisplay() {
    // Chip runs render inline within one concatenated `Text`, so per-run
    // `lineLimit` isn't expressible -- oversized labels are truncated at
    // parse time instead (Visual Contract §3: "~1-line ellipsis").
    let hugeLabel = String(repeating: "x", count: 10_000)
    let content = "@release:rel_1[\(hugeLabel)]"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    guard case let .text(runs) = segments[0], case let .entity(_, _, label) = runs[0] else {
      Issue.record("Expected a single entity run")
      return
    }

    #expect(label.count <= 61) // 60-char budget + ellipsis character
    #expect(label.hasSuffix("…"))
  }

  @Test func doesNotTruncateShortEntityLabels() {
    let content = "@release:rel_1[Midnight Drive]"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
      ]),
    ])
  }

  @Test func mixedEntityAndSkillTokensParseInOrder() {
    let content =
      "hey /skill:generateAlbumArt for @release:rel_1[Midnight Drive] please"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .text("hey "),
        .skill(id: "generateAlbumArt", label: "Generate album art"),
        .text(" for "),
        .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
        .text(" please"),
      ]),
    ])
  }

  @Test func displayTextStripsTokenMarkupAndKeepsOnlyLabels() {
    let content = "Check out @release:rel_1[Midnight Drive] via /skill:generateAlbumArt"

    let displayText = MobileChatContentParser.displayText(from: content, isStreaming: false)

    #expect(displayText.contains("@release:") == false)
    #expect(displayText.contains("/skill:") == false)
    #expect(displayText.contains("Midnight Drive"))
    #expect(displayText.contains("Generate album art"))
  }

  @Test func doesNotSuppressPlainAtMentionsDuringStreaming() {
    // "DM @timwhite" must never be suppressed -- it is not a strict prefix of
    // a valid `@kind:` token (kind isn't one of the four known entity kinds).
    let content = "DM @timwhite about the show"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments == [.text(runs: [.text("DM @timwhite about the show")])])
  }

  @Test func suppressesStrictPrefixOfEntityTokenWhileStreaming() {
    // "@release:" alone, with no id/label yet, is a strict prefix of a valid
    // token -- must be suppressed until more of the stream arrives.
    let content = "Check out @release:"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments == [.text(runs: [.text("Check out")])])
  }

  @Test func suppressesUnclosedEntityLabelWhileStreaming() {
    let content = "Check out @release:rel_1[Midnight Dri"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments == [.text(runs: [.text("Check out")])])
  }

  @Test func suppressesUnclosedEntityLabelRespectingEscapedBracketWhileStreaming() {
    // The escaped `\]` inside the label must not be mistaken for the closing
    // bracket -- the token is still open.
    let content = "@track:trk_1[Live at Brooklyn Steel [2026\\"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments == [])
  }

  @Test func doesNotSuppressCompletedTokenFollowedByMoreProseWhileStreaming() {
    let content = "Check out @release:rel_1[Midnight Drive] and more text after"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments == [
      .text(runs: [
        .text("Check out "),
        .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
        .text(" and more text after"),
      ]),
    ])
  }

  @Test func rendersUnterminatedTokenVerbatimWhenStreamEnds() {
    // isStreaming: false means the stream has ended -- an unterminated token
    // is dead text, not a live prefix, so it renders as-is (web parity).
    let content = "Check out @release:rel_1[Midnight Dri"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [.text(runs: [.text("Check out @release:rel_1[Midnight Dri")])])
  }

  @Test func suppressesUnclosedSkillIdWhileStreaming() {
    let content = "Try /skill:generateAlbum"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)

    #expect(segments == [.text(runs: [.text("Try")])])
  }

  @Test func totalFunctionNeverThrowsOnHostileLabels() {
    let hostileInputs = [
      "@release:rel_1[[click](https://evil.example)]",
      "@artist:art_1[\u{202E}evil reversed text]",
      String(repeating: "@release:rel_1[a] ", count: 500),
      "@release:rel_1[" + String(repeating: "x", count: 10_000) + "]",
      "",
      "@:[",
      "@release:[]",
      "\\\\\\\\\\",
    ]

    for input in hostileInputs {
      // Must not crash/throw for any input, streaming or not.
      _ = MobileChatContentParser.segments(from: input, isStreaming: true)
      _ = MobileChatContentParser.segments(from: input, isStreaming: false)
      _ = MobileChatContentParser.displayText(from: input, isStreaming: false)
    }
  }

  @Test func roundTripsEntityLabelWithLiteralBackslash() {
    let content = "@release:rel_1[path\\\\to\\\\thing]"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .entity(kind: .release, id: "rel_1", label: "path\\to\\thing"),
      ]),
    ])
  }

  @Test func adjacentTokensWithoutInterveningTextParseCleanly() {
    let content = "/skill:generateAlbumArt@release:rel_1[Drive]"

    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(segments == [
      .text(runs: [
        .skill(id: "generateAlbumArt", label: "Generate album art"),
        .entity(kind: .release, id: "rel_1", label: "Drive"),
      ]),
    ])
  }

  // MARK: - Memoization (F14)

  @Test func repeatedParseOfIdenticalContentReturnsEqualSegments() {
    // Exercises the memoized cache-hit path: calling with identical
    // (content, isStreaming) repeatedly -- as SwiftUI does on every body
    // re-evaluation while a message streams -- must keep returning the
    // correct, stable parse rather than a stale or corrupted cached value.
    let content = "Check out @release:rel_1[Midnight Drive] via /skill:generateAlbumArt"

    let first = MobileChatContentParser.segments(from: content, isStreaming: false)
    let second = MobileChatContentParser.segments(from: content, isStreaming: false)
    let third = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(first == second)
    #expect(second == third)
    #expect(first == [
      .text(runs: [
        .text("Check out "),
        .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
        .text(" via "),
        .skill(id: "generateAlbumArt", label: "Generate album art"),
      ]),
    ])
  }

  @Test func cacheKeyDistinguishesStreamingFromCompleteForIdenticalContent() {
    // Same content, different `isStreaming` -- must not collide in the cache
    // and return each mode's distinct (correct) parse.
    let content = "Check out @release:rel_1[Midnight Dri"

    let streaming = MobileChatContentParser.segments(from: content, isStreaming: true)
    let complete = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(streaming == [.text(runs: [.text("Check out")])])
    #expect(complete == [.text(runs: [.text(content)])])
  }

  @Test func cacheDoesNotCollideOnSharedPrefixWithDifferentSuffixes() {
    // Regression guard for a naive cache keyed only on a content prefix or
    // hash truncation: two different streaming deltas that share a prefix
    // must each be parsed (and suppressed) independently.
    let shorter = "Check out @release:rel_1[Midnight Dri"
    let longer = "Check out @release:rel_1[Midnight Drive] and more"

    let shorterSegments = MobileChatContentParser.segments(from: shorter, isStreaming: true)
    let longerSegments = MobileChatContentParser.segments(from: longer, isStreaming: true)

    #expect(shorterSegments == [.text(runs: [.text("Check out")])])
    #expect(longerSegments == [
      .text(runs: [
        .text("Check out "),
        .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
        .text(" and more"),
      ]),
    ])
  }

  // MARK: - Positional segment identity (F15)

  @Test func segmentIdentityIsStableAcrossRepeatedParsesOfSameContent() {
    let content = "Check out @release:rel_1[Midnight Drive] today"

    let first = MobileChatContentParser.segments(from: content, isStreaming: false)
    let second = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(first.map(\.id) == second.map(\.id))
  }

  @Test func segmentIdentityDiffersForDifferentContent() {
    // Positional identity must still distinguish genuinely different
    // content -- guards against an over-eager seed that collapses distinct
    // segments onto the same SwiftUI identity.
    let contentA = "@release:rel_1[Midnight Drive]"
    let contentB = "@artist:art_1[Porter Robinson]"

    let segmentsA = MobileChatContentParser.segments(from: contentA, isStreaming: false)
    let segmentsB = MobileChatContentParser.segments(from: contentB, isStreaming: false)

    #expect(segmentsA[0].id != segmentsB[0].id)
  }
}

// MARK: - Contract-drift breadcrumb (expansion #1)

/// `.serialized`: these tests swap the process-global `Observability`
/// provider (`useProviderForTesting`/`resetForTesting`). Swift Testing runs
/// tests within a suite concurrently by default, so without serialization
/// these races with themselves -- one test's `resetForTesting()` (or another
/// test's `useProviderForTesting(spy)`) can fire in the middle of a sibling
/// test's assertion window, making `spy.breadcrumbs` empty nondeterministically.
@Suite(.serialized)
struct MobileChatEntityTokenBreadcrumbTests {
  @Test func reportsBreadcrumbForPatternMatchedButUnmappedEntityKind() {
    let spy = SpyObservabilityProvider()
    Observability.useProviderForTesting(spy)
    defer { Observability.resetForTesting() }

    let content = "@merch:tee_1[Tour Tee] stays as text"
    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)

    // Rendering is unaffected -- still verbatim text (web parity).
    #expect(segments == [.text(runs: [.text(content)])])

    #expect(spy.breadcrumbs.contains { $0.event == .chatEntityTokenUnmappedKind })
    #expect(spy.breadcrumbs.first { $0.event == .chatEntityTokenUnmappedKind }?.context["kind"] as? String == "merch")
  }

  @Test func doesNotReportBreadcrumbForOrdinaryAtMentions() {
    let spy = SpyObservabilityProvider()
    Observability.useProviderForTesting(spy)
    defer { Observability.resetForTesting() }

    let content = "DM @timwhite about the show, no token here"
    _ = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(spy.breadcrumbs.contains { $0.event == .chatEntityTokenUnmappedKind } == false)
  }

  @Test func doesNotReportBreadcrumbForKnownEntityKinds() {
    let spy = SpyObservabilityProvider()
    Observability.useProviderForTesting(spy)
    defer { Observability.resetForTesting() }

    let content = "@release:rel_1[Midnight Drive] is out"
    _ = MobileChatContentParser.segments(from: content, isStreaming: false)

    #expect(spy.breadcrumbs.contains { $0.event == .chatEntityTokenUnmappedKind } == false)
  }
}

// MARK: - Entity chip thumbnails v2 (GH-12708)

struct MobileChatEntityThumbnailResolverTests {
  @Test func resolvesFixtureReleaseThumbnail() {
    let url = MobileChatEntityThumbnailResolver.thumbnailURL(kind: .release, id: "rel_1")
    #expect(url?.absoluteString.contains("rel_1") == true)
  }

  @Test func resolvesFixtureArtistThumbnail() {
    let url = MobileChatEntityThumbnailResolver.thumbnailURL(kind: .artist, id: "art_1")
    #expect(url?.absoluteString.contains("art_1") == true)
  }

  @Test func eventFixtureHasNoThumbnail() {
    let url = MobileChatEntityThumbnailResolver.thumbnailURL(kind: .event, id: "evt_1")
    #expect(url == nil)
  }

  @Test func unknownEntityIdReturnsNil() {
    let url = MobileChatEntityThumbnailResolver.thumbnailURL(kind: .release, id: "unknown")
    #expect(url == nil)
  }
}

struct MobileChatProseFlowTokenTests {
  @Test func keepsPlainTextInOneWrapFlow() {
    let sentence = "Hello world"
    let tokens = MobileChatBubbleText.wrapUnits(from: [.text(sentence)])
    #expect(tokens == [.text(sentence)])
    #expect(String(MobileChatBubbleText.attributedText(from: tokens).characters) == sentence)
    #expect(MobileChatProseText.flowTokens(from: [.text(sentence)]) == tokens)
  }

  @Test(
    arguments: [
      "Yo what's the move tonight after the show",
      "Jovie can you look at this release for me",
      "Other than that we should ship the drop today",
      "Ask me anything about the remaining tour dates",
      "this is a longer user message about the next release",
    ]
  )
  func doesNotDetachTheFirstWordAsItsOwnRun(sentence: String) {
    let units = MobileChatBubbleText.wrapUnits(from: [.text(sentence)])
    #expect(units == [.text(sentence)])

    let attributed = MobileChatBubbleText.attributedText(from: units)
    #expect(String(attributed.characters) == sentence)
    #expect(Array(attributed.runs).count == 1)

    let firstWord = String(sentence.split(separator: " ").first ?? "")
    let lines = textKitLineFragments(attributed, maxWidth: 160)
    #expect(!lines.isEmpty)
    #expect(lines[0].hasPrefix("\(firstWord) "))
    #expect(lines[0].split(whereSeparator: \.isWhitespace).count > 1)
  }

  @Test func mergesAdjacentTextRunsIntoOneWrapFlow() {
    let units = MobileChatBubbleText.wrapUnits(from: [
      .text("Yo"),
      .text(" what's the move"),
    ])
    #expect(units == [.text("Yo what's the move")])
    #expect(
      String(MobileChatBubbleText.attributedText(from: units).characters) == "Yo what's the move"
    )
  }

  @Test func preservesEntityRunsAsSingleChipToken() {
    let tokens = MobileChatBubbleText.wrapUnits(from: [
      .text("See "),
      .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
      .text(" today"),
    ])
    #expect(tokens == [
      .text("See "),
      .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
      .text(" today"),
    ])
    #expect(
      String(MobileChatBubbleText.attributedText(from: tokens).characters) == "See  today"
    )
  }

  @Test func skillLabelsStayInsideTheAttributedTextFlow() {
    let units = MobileChatBubbleText.wrapUnits(from: [
      .text("Ask "),
      .skill(id: "generateAlbumArt", label: "Generate album art"),
      .text(" now"),
    ])
    let attributed = MobileChatBubbleText.attributedText(from: units)
    #expect(String(attributed.characters) == "Ask Generate album art now")
    #expect(units.contains(where: \.isEntityChip) == false)
  }
}

private func textKitLineFragments(_ attributed: AttributedString, maxWidth: CGFloat) -> [String] {
  let ns = NSMutableAttributedString(attributed)
  let fullRange = NSRange(location: 0, length: ns.length)
  if ns.length > 0, ns.attribute(.font, at: 0, effectiveRange: nil) == nil {
    ns.addAttribute(.font, value: UIFont.systemFont(ofSize: 16), range: fullRange)
  }

  let storage = NSTextStorage(attributedString: ns)
  let layoutManager = NSLayoutManager()
  let container = NSTextContainer(size: CGSize(width: maxWidth, height: .greatestFiniteMagnitude))
  container.lineFragmentPadding = 0
  layoutManager.addTextContainer(container)
  storage.addLayoutManager(layoutManager)

  var lines: [String] = []
  let glyphRange = NSRange(location: 0, length: layoutManager.numberOfGlyphs)
  layoutManager.enumerateLineFragments(forGlyphRange: glyphRange) { _, _, _, lineGlyphRange, _ in
    let characterRange = layoutManager.characterRange(forGlyphRange: lineGlyphRange, actualGlyphRange: nil)
    lines.append((ns.string as NSString).substring(with: characterRange))
  }
  return lines
}

private final class SpyObservabilityProvider: ObservabilityProvider {
  struct Breadcrumb {
    let event: ObservabilityEvent
    let level: ObservabilityLevel
    let context: ObservabilityContext
  }

  private(set) var breadcrumbs: [Breadcrumb] = []

  func configure(_ configuration: ObservabilityConfiguration) {}
  func captureError(_ error: Error, event: ObservabilityEvent, context: ObservabilityContext) {}
  func captureMessage(_ event: ObservabilityEvent, level: ObservabilityLevel, context: ObservabilityContext) {}

  func addBreadcrumb(_ event: ObservabilityEvent, level: ObservabilityLevel, context: ObservabilityContext) {
    breadcrumbs.append(Breadcrumb(event: event, level: level, context: context))
  }

  func setUser(id: String) {}
  func clearUser() {}
  func setTag(key: String, value: String) {}
  func startSpan(name: ObservabilityEvent, context: ObservabilityContext) -> ObservabilitySpan {
    NoopObservabilitySpan()
  }
}

/// JOV-6000: the "Thinking" dots must exist only while authoritative
/// timeline state says assistant work is in flight with nothing renderable,
/// and the breathe loop may run only on an active scene without Reduce
/// Motion. Terminal states, backgrounding, and reduced motion all resolve
/// to the static/hidden state deterministically.
struct MobileChatThinkingIndicatorTests {
  @Test func showsIndicatorOnlyForInFlightEmptyAssistantTurn() {
    #expect(
      MobileChatThinkingIndicator.shouldDisplay(
        role: .assistant,
        status: .streaming,
        hasRenderableContent: false
      )
    )
  }

  @Test func hidesIndicatorForEveryTerminalStatus() {
    for status: MobileChatTimelineStatus in [.idle, .completed, .failed, .canceled] {
      #expect(
        !MobileChatThinkingIndicator.shouldDisplay(
          role: .assistant,
          status: status,
          hasRenderableContent: false
        ),
        "Indicator must not render for terminal status \(status)"
      )
    }
  }

  @Test func showsIndicatorForAllInFlightStatuses() {
    for status: MobileChatTimelineStatus in [.sending, .queued, .running, .retrying, .streaming] {
      #expect(
        MobileChatThinkingIndicator.shouldDisplay(
          role: .assistant,
          status: status,
          hasRenderableContent: false
        ),
        "Indicator must render for in-flight status \(status)"
      )
    }
  }

  @Test func hidesIndicatorForUserTurnsAndRenderableContent() {
    #expect(
      !MobileChatThinkingIndicator.shouldDisplay(
        role: .user,
        status: .streaming,
        hasRenderableContent: false
      )
    )
    #expect(
      !MobileChatThinkingIndicator.shouldDisplay(
        role: .assistant,
        status: .streaming,
        hasRenderableContent: true
      )
    )
  }

  @Test func animationRunsOnlyOnActiveSceneWithoutReduceMotion() {
    #expect(
      MobileChatThinkingIndicator.shouldAnimate(reduceMotion: false, scenePhase: .active)
    )
    // Background and inactive must stop the loop; reconnect/foreground only
    // resumes when this returns true again while the view is still mounted.
    #expect(
      !MobileChatThinkingIndicator.shouldAnimate(reduceMotion: false, scenePhase: .background)
    )
    #expect(
      !MobileChatThinkingIndicator.shouldAnimate(reduceMotion: false, scenePhase: .inactive)
    )
    #expect(
      !MobileChatThinkingIndicator.shouldAnimate(reduceMotion: true, scenePhase: .active)
    )
    #expect(
      !MobileChatThinkingIndicator.shouldAnimate(reduceMotion: true, scenePhase: .background)
    )
  }
}

struct MobileChatResultOnlyMerchTests {
  // Exact generation JSON from completionPreservesResultOnlyMerchHandoff (JOV-7692).
  private let generation = #"{"success":true,"generationId":"generation-merch","nextStep":"Choose your design","options":[{"#
    + #""id":"option-merch","option_number":1,"design_name":"Night Sky","product_type":"t-shirt","#
    + #""printful_product_name":"Premium Tee","colorway":"Black","concept":"Stars above the stage","#
    + #""mockup_urls":["https://images.example/merch.png"],"price_recommendation":{"sale_price":"29.00"}}]}"#
  // Exact preview output fields from the JOV-7692 terminal persistence fixture.
  private let preview = #"{"success":true,"generationId":"gen-2","designs":[{"id":"design-1","option_number":1,"design_name":"Neon Pulse","status":"ready","preview_url":"https://cdn.test/neon.jpg"}]}"#

  private func options(_ id: String = "generation-merch", updated: Bool = false) -> String {
    var json = generation.replacingOccurrences(of: "generation-merch", with: id)
    if updated {
      json = json.replacingOccurrences(of: "Night Sky", with: "Dawn Sky")
        .replacingOccurrences(of: "merch.png", with: "updated.png")
        .replacingOccurrences(of: "29.00", with: "39.00")
    }
    return json
  }

  private func expectedOptions(_ id: String = "generation-merch", updated: Bool = false) -> MobileChatMerchArtifact {
    .productOptions(MobileChatMerchOptionsPayload(
      generationId: id, nextStep: "Choose your design", options: [MobileChatMerchOptionCard(
        id: "option-merch", optionNumber: 1, designName: updated ? "Dawn Sky" : "Night Sky",
        productLabel: "Premium Tee", colorway: "Black", concept: "Stars above the stage",
        mockupURL: URL(string: updated ? "https://images.example/updated.png" : "https://images.example/merch.png"),
        salePrice: updated ? "39.00" : "29.00"
      )]
    ))
  }

  private var expectedPreview: MobileChatMerchArtifact {
    .designCarousel(MobileChatMerchDesignsPayload(generationId: "gen-2", nextStep: nil, designs: [
      MobileChatMerchDesignCard(id: "design-1", optionNumber: 1, designName: "Neon Pulse",
        concept: "", previewURL: URL(string: "https://cdn.test/neon.jpg"), isReady: true),
    ]))
  }

  private func result(_ json: String, name: String = "createMerch", dialect: String = "tool_result", state: String = "success") -> String {
    "<\(dialect)><name>\(name)</name><state>\(state)</state><json>\(json)</json></\(dialect)>"
  }

  private func call(_ name: String, function: Bool = false) -> String {
    function ? "<function_calls><invoke name=\"\(name)\"></invoke></function_calls>"
      : "<tool_call><name>\(name)</name><parameters></parameters></tool_call>"
  }

  private func artifacts(_ segments: [MobileChatRenderableSegment]) -> [MobileChatMerchArtifact] {
    segments.compactMap { if case let .merchArtifact(value) = $0 { return value }; return nil }
  }

  private func order(_ segments: [MobileChatRenderableSegment]) -> [String] {
    segments.compactMap {
      if case let .toolCall(value) = $0 { return "call:\(value.toolName)" }
      if case let .merchArtifact(value) = $0 { return value.id }
      return nil
    }
  }

  @Test(arguments: ["tool_result", "function_result"], [false, true])
  func canonicalResultOnlyPayloadSurvivesWithoutFabricatedCalls(dialect: String, withProse: Bool) {
    let prose = withProse ? "Your merch options are ready.\n" : ""
    let fixtures = [("createMerch", generation, expectedOptions()), ("previewMerchOptions", preview, expectedPreview)]
    for (name, json, expectedArtifact) in fixtures {
      let content = prose + result(json, name: name, dialect: dialect)
      let expected: [MobileChatRenderableSegment] = (withProse ? [.text(runs: [.text("Your merch options are ready.")])] : [])
        + [.merchArtifact(expectedArtifact)]
      for streaming in [false, true] {
        let first = MobileChatContentParser.segments(from: content, isStreaming: streaming)
        #expect(first == expected)
        #expect(MobileChatContentParser.segments(from: content, isStreaming: streaming) == first)
        #expect(MobileChatContentParser.displayText(from: content, isStreaming: streaming) == prose.trimmingCharacters(in: .newlines))
      }
    }
  }

  @Test(arguments: [false, true])
  func mixedDialectUpdatesKeepFirstSuccessRankAndLatestFullPayload(mirrored: Bool) {
    let first = mirrored ? "tool_result" : "function_result"
    let last = mirrored ? "function_result" : "tool_result"
    let content = "🎸 Results\n" + result(options("A"), dialect: first)
      + result(options("B"), dialect: last) + result(options("A", updated: true), dialect: last)
    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    #expect(artifacts(segments) == [expectedOptions("A", updated: true), expectedOptions("B")])
    #expect(order(segments) == ["merch-options:A", "merch-options:B"])
  }

  @Test(arguments: [false, true])
  func repeatedCallsRetainTheirCardsAndEmitEveryGenerationOnlyOnce(function: Bool) {
    let invocation = call("createMerch", function: function)
    let content = invocation + result(options("A")) + result(options("B"))
      + invocation + result(options("A", updated: true))
    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    #expect(order(segments) == ["call:createMerch", "merch-options:A", "merch-options:B", "call:createMerch"])
    #expect(artifacts(segments) == [expectedOptions("A", updated: true), expectedOptions("B")])
    let cards = segments.compactMap { if case let .toolCall(value) = $0 { return value }; return nil }
    let original = MobileChatContentParser.segments(from: invocation + result(options("A")), isStreaming: false)
    let originalCards = original.compactMap { if case let .toolCall(value) = $0 { return value }; return nil }
    #expect(cards == originalCards + originalCards)
  }

  @Test func kindSpecificIDsAndFirstSuccessfulNameControlPlacement() {
    let designs = preview.replacingOccurrences(of: "gen-2", with: "A")
    let content = call("previewMerchOptions") + call("createMerch")
      + result(options("A")) + result(designs, name: "previewMerchOptions")
      + result(options("A", updated: true), name: "previewMerchOptions", dialect: "function_result")
    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    #expect(order(segments) == ["call:previewMerchOptions", "merch-designs:A", "call:createMerch", "merch-options:A"])
    #expect(artifacts(segments).last == expectedOptions("A", updated: true))
    #expect(Set(artifacts(segments).map(\.id)).count == 2)
  }

  @Test func explicitCallAnchorsTakePriorityOverCrossToolResultArrivalOrder() {
    let results = result(preview, name: "previewMerchOptions") + result(generation)
    let anchored = MobileChatContentParser.segments(from: call("createMerch") + call("previewMerchOptions") + results, isStreaming: false)
    let unanchored = MobileChatContentParser.segments(from: results, isStreaming: false)
    #expect(order(anchored) == ["call:createMerch", "merch-options:generation-merch", "call:previewMerchOptions", "merch-designs:gen-2"])
    #expect(artifacts(anchored) == [expectedOptions(), expectedPreview])
    #expect(artifacts(unanchored) == [expectedPreview, expectedOptions()])
  }

  @Test(arguments: ["failed", "running", "malformed"])
  func unsuccessfulSameIDCannotEraseSuccessfulPayloadOrChangeCallState(failure: String) {
    let state = failure == "malformed" ? "success" : failure
    let json = failure == "malformed" ? #"{"generationId":"A","success":true,"# : options("A", updated: true)
    let content = call("createMerch") + result(options("A")) + result(json, state: state)
    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    let states = segments.compactMap { if case let .toolCall(value) = $0 { return value.state }; return nil }
    let expectedState: MobileChatToolCallState = failure == "failed" ? .failed : (failure == "running" ? .running : .succeeded)
    #expect(states == [expectedState])
    #expect(artifacts(segments) == [expectedOptions("A")])
    #expect(order(segments) == ["call:createMerch", "merch-options:A"])
  }

  @Test(arguments: ["failed", "running", "success-false", "missing-generation", "empty-generation", "missing-cards", "empty-cards", "invalid-cards", "malformed", "unsupported"])
  func ineligibleResultsPreserveUnrelatedAndEnumeratedProse(reason: String) {
    var json = generation
    switch reason {
    case "success-false": json = generation.replacingOccurrences(of: "\"success\":true", with: "\"success\":false")
    case "missing-generation": json = generation.replacingOccurrences(of: "\"generationId\":\"generation-merch\",", with: "")
    case "empty-generation": json = generation.replacingOccurrences(of: "generation-merch", with: "")
    case "missing-cards": json = #"{"success":true,"generationId":"A"}"#
    case "empty-cards": json = #"{"success":true,"generationId":"A","options":[],"designs":[]}"#
    case "invalid-cards": json = #"{"success":true,"generationId":"A","options":[{}]}"#
    case "malformed": json = #"{"success":true,"generationId":"A","#
    default: break
    }
    let prose = "Keep this context.\n**1. Night Sky** is the only explanation."
    for dialect in ["tool_result", "function_result"] {
      let content = prose + result(json, name: reason == "unsupported" ? "unknownMerchTool" : "createMerch",
        dialect: dialect, state: reason == "failed" || reason == "running" ? reason : "success")
      #expect(MobileChatContentParser.segments(from: content, isStreaming: false) == [.text(runs: [.text(prose)])])
      #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == prose)
    }
  }

  @Test func failedObservationCannotClaimFirstRankOrPlacementAnchor() {
    let content = call("previewMerchOptions") + call("createMerch")
      + result(options("A"), name: "previewMerchOptions", state: "failed")
      + result(options("B")) + result(options("A"))
      + result(options("A", updated: true), name: "previewMerchOptions")
    let segments = MobileChatContentParser.segments(from: content, isStreaming: false)
    #expect(order(segments) == ["call:previewMerchOptions", "call:createMerch", "merch-options:B", "merch-options:A"])
    #expect(artifacts(segments) == [expectedOptions("B"), expectedOptions("A", updated: true)])
  }

  @Test(arguments: ["tool_result", "function_result", "tool_call", "function_calls"])
  func onlyCompleteResultsProduceArtifactsAmidPartialStreamingMarkup(dialect: String) {
    let partial: String
    if dialect.hasSuffix("result") {
      partial = result(options("incomplete-B"), dialect: dialect)
        .replacingOccurrences(of: "</\(dialect)>", with: "")
    } else {
      partial = dialect == "tool_call" ? "<tool_call><name>createMerch</name><parameters>"
        : "<function_calls><invoke name=\"createMerch\">"
    }
    let content = "Ready\n" + result(generation) + partial
    let segments = MobileChatContentParser.segments(from: content, isStreaming: true)
    #expect(artifacts(segments) == [expectedOptions()])
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: true) == "Ready")
    #expect(MobileChatContentParser.segments(from: content, isStreaming: true) == segments)
  }

  @Test func merchArtifactsDoNotCollapseStreamingAndCompletedCacheModes() {
    let prose = "Look @release:rel_1[Midnight Dri"
    let content = result(generation) + prose
    let streaming = MobileChatContentParser.segments(from: content, isStreaming: true)
    let completed = MobileChatContentParser.segments(from: content, isStreaming: false)
    #expect(streaming != completed)
    #expect(artifacts(streaming) == [expectedOptions()] && artifacts(completed) == [expectedOptions()])
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: true) == "Look")
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false) == prose)
    #expect(MobileChatContentParser.segments(from: content, isStreaming: true) == streaming)
    #expect(MobileChatContentParser.segments(from: content, isStreaming: false) == completed)
  }

  @Test func actualResultOnlyArtifactSuppressesItsEnumeratedDuplicateProse() {
    let content = "**1. Night Sky** — Stars above the stage.\n" + result(generation)
    #expect(MobileChatContentParser.segments(from: content, isStreaming: false) == [.merchArtifact(expectedOptions())])
    #expect(MobileChatContentParser.displayText(from: content, isStreaming: false).isEmpty)
  }
}
