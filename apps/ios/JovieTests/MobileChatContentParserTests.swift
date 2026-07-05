import Foundation
import Testing
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
  @Test func splitsPlainTextIntoWordTokens() {
    let tokens = MobileChatProseText.flowTokens(from: [.text("Hello world")])
    #expect(tokens == [.textWord("Hello"), .textWord(" "), .textWord("world")])
  }

  @Test func preservesEntityRunsAsSingleChipToken() {
    let tokens = MobileChatProseText.flowTokens(from: [
      .text("See "),
      .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
      .text(" today"),
    ])
    #expect(tokens.count == 5)
    guard case .entity(.release, "rel_1", "Midnight Drive") = tokens[2] else {
      Issue.record("Expected entity token at index 2")
      return
    }
  }
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
