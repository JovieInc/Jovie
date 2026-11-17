// The What's New feed source: catalog, wire types, resolve/decode policy,
// feed client and the deterministic UI-test fixture. The production sheet
// (JovieChangelogWhatsNewView) and its presentation stay in RootView.swift.
import Foundation
import SwiftUI

struct WhatsNewItem: Equatable, Identifiable {
  let id: String
  let title: String
  let testHint: String
}

enum WhatsNewCatalog {
  static func items(for version: String) -> [WhatsNewItem] {
    switch version {
    case "1.0":
      return [
        WhatsNewItem(
          id: "chat-home",
          title: "Chat is home",
          testHint: "Open a signed-in session and confirm Ask Jovie is the first ready surface."
        ),
        WhatsNewItem(
          id: "swipe-shell",
          title: "Swipe sidebar and right rail",
          testHint: "Swipe from the leading edge to open the sidebar and from the trailing edge to open the right rail. Confirm there is no bottom tab bar."
        ),
        WhatsNewItem(
          id: "sidebar-destinations",
          title: "Work, Calendar, and Inbox live in the sidebar",
          testHint: "Open the sidebar and tap Work, Calendar, Inbox, Profile, Audience, and Talk. None of these should be bottom tabs."
        ),
        WhatsNewItem(
          id: "chat-quality",
          title: "Chat renders labels, not markup",
          testHint: "Open a chat transcript and confirm entity/skill chips and tool cards show labels, not raw @kind:, /skill:, or <tool_call>."
        ),
      ]
    default:
      return [
        WhatsNewItem(
          id: "review-version",
          title: "Review version \(version)",
          testHint: "Open What’s New for \(version) and walk each listed change on a signed-in chat session."
        ),
      ]
    }
  }
}

struct JovieWhatsNewView: View {
  let version: String
  let items: [WhatsNewItem]
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      HStack {
        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text("What’s New")
            .font(JovieFont.display(size: 24))
            .foregroundStyle(JovieColor.textPrimary)
          Text("Version \(version)")
            .font(JovieFont.body(size: 14))
            .foregroundStyle(JovieColor.textTertiary)
        }
        Spacer()
        Image(systemName: "sparkles")
          .font(.title2)
          .foregroundStyle(JovieColor.accent)
          .accessibilityHidden(true)
      }

      VStack(alignment: .leading, spacing: JovieSpacing.medium) {
        ForEach(items) { item in
          VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
            Text(item.title)
              .font(JovieFont.body(size: 16, weight: .semibold))
              .foregroundStyle(JovieColor.textPrimary)
            Text(item.testHint)
              .font(JovieFont.body(size: 15))
              .foregroundStyle(JovieColor.textSecondary)
          }
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("whats-new-item-\(item.id)")
        }
      }

      Spacer(minLength: 0)

      Button("Done") {
        dismiss()
      }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("whats-new-done")
    }
    .padding(JovieSpacing.large)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(JovieColor.backgroundBase)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("What’s New, version \(version)")
  }
}

// MARK: - Remote What's New (changelog feed)

/// One release from `GET /changelog/whats-new.json` (contract version 1).
/// `CHANGELOG.md` on the web is the only source; the id is the release version.
struct WhatsNewFeedEntry: Decodable, Equatable, Sendable {
  let id: String
  let title: String
  let date: String
  let summary: String
  let url: URL
  let highlights: [String]
  let dogfood: [String]
}

struct WhatsNewFeed: Decodable, Equatable, Sendable {
  static let contractVersion = 1
  static let path = "changelog/whats-new.json"

  let version: Int
  let changelogUrl: URL
  let entries: [WhatsNewFeedEntry]
}

struct WhatsNewUnseen: Equatable, Identifiable, Sendable {
  let entry: WhatsNewFeedEntry
  let unseenCount: Int
  /// The post for one unseen release, the changelog index for several.
  let link: URL

  var id: String { entry.id }
}

enum WhatsNewFeedPolicy {
  static let lastSeenStorageKey = "jovie.whatsNew.lastSeenID"

  /// Mirrors `resolveUnseenWhatsNew` in apps/web/lib/whats-new.ts.
  /// No last-seen id (or one that aged out of the feed) counts only the
  /// newest release, so a first launch never reads as a backlog.
  static func resolve(feed: WhatsNewFeed, lastSeenID: String?) -> WhatsNewUnseen? {
    guard let newest = feed.entries.first, newest.id != lastSeenID else {
      return nil
    }
    let seenIndex = lastSeenID.flatMap { id in
      feed.entries.firstIndex { $0.id == id }
    } ?? 0
    let unseenCount = max(seenIndex, 1)
    return WhatsNewUnseen(
      entry: newest,
      unseenCount: unseenCount,
      link: unseenCount > 1 ? feed.changelogUrl : newest.url
    )
  }

  /// Decode an untrusted payload; any other contract version reads as "nothing new".
  static func decode(_ data: Data) -> WhatsNewFeed? {
    guard
      let feed = try? JSONDecoder().decode(WhatsNewFeed.self, from: data),
      feed.version == WhatsNewFeed.contractVersion
    else {
      return nil
    }
    return feed
  }
}

struct WhatsNewFeedClient: Sendable {
  let webBaseURL: URL
  var session: URLSession = URLSession(configuration: .jovieMobile)

  /// Returns nil on any network, status, or contract failure. The sheet stays silent.
  func fetch() async -> WhatsNewFeed? {
    var request = URLRequest(url: webBaseURL.appending(path: WhatsNewFeed.path))
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    guard
      let result = try? await session.data(for: request),
      let http = result.1 as? HTTPURLResponse,
      (200..<300).contains(http.statusCode)
    else {
      return nil
    }
    return WhatsNewFeedPolicy.decode(result.0)
  }
}

/// Deterministic content for the actual production sheet; never fetched or persisted as live data.
enum WhatsNewUITestFixture {
  static func unseen(arguments: [String] = ProcessInfo.processInfo.arguments) -> WhatsNewUnseen? {
    guard
      let postURL = URL(string: "https://jov.ie/changelog/ui-fixture-current"),
      let indexURL = URL(string: "https://jov.ie/changelog")
    else { return nil }
    let multiple = arguments.contains("-ui-testing-whats-new-multiple")
    let long = arguments.contains("-ui-testing-whats-new-long")
    let emptyDogfood = arguments.contains("-ui-testing-whats-new-no-dogfood")
    let items = WhatsNewCatalog.items(for: "1.0")
    let newest = WhatsNewFeedEntry(
      id: "ui-fixture-current",
      title: long ? items.map(\.title).joined(separator: ". ") : items[0].title,
      date: "2026-10-19",
      summary: long ? items.map(\.testHint).joined(separator: " ") : items[0].testHint,
      url: postURL,
      highlights: [],
      dogfood: emptyDogfood ? [] : Array(items.prefix(3).map(\.testHint))
    )
    let older = WhatsNewFeedEntry(
      id: "ui-fixture-seen", title: items[1].title, date: "2026-10-18",
      summary: items[1].testHint, url: newest.url, highlights: [], dogfood: []
    )
    let middle = WhatsNewFeedEntry(
      id: "ui-fixture-middle", title: items[2].title, date: "2026-10-19",
      summary: items[2].testHint, url: newest.url, highlights: [], dogfood: []
    )
    let feed = WhatsNewFeed(
      version: WhatsNewFeed.contractVersion,
      changelogUrl: indexURL,
      entries: multiple ? [newest, middle, older] : [newest]
    )
    // A fixture cannot exercise the network. Resolve through the production policy.
    return WhatsNewFeedPolicy.resolve(feed: feed, lastSeenID: multiple ? older.id : nil)
  }
}
