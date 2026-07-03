import Testing
import UIKit
@testable import Jovie

struct MobileChatEntityThumbnailResolverTests {
  @Test func fixtureRegistryReturnsStableArtworkURLs() {
    #expect(
      MobileChatEntityThumbnailResolver.thumbnailURL(kind: .release, id: "rel_1")?.absoluteString
        .contains("jovie-rel-1") == true
    )
    #expect(
      MobileChatEntityThumbnailResolver.thumbnailURL(kind: .artist, id: "art_1") != nil
    )
    #expect(MobileChatEntityThumbnailResolver.thumbnailURL(kind: .track, id: "unknown") == nil)
  }
}

struct MobileChatInlineFragmentTests {
  @Test func splitsTextRunsOnNewlinesWithoutDroppingContent() {
    let fragments = MobileChatInlineFragment.fragments(from: [
      .text("Line one\nLine two"),
      .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
    ])

    #expect(fragments == [
      .text("Line one"),
      .lineBreak,
      .text("Line two"),
      .entity(kind: .release, id: "rel_1", label: "Midnight Drive"),
    ])
  }

  @Test func preservesEntityAndSkillRunsInOrder() {
    let fragments = MobileChatInlineFragment.fragments(from: [
      .text("Hey "),
      .entity(kind: .artist, id: "art_1", label: "Porter Robinson"),
      .text(" — "),
      .skill(id: "generateAlbumArt", label: "Generate album art"),
    ])

    #expect(fragments.count == 4)
    #expect(fragments[1] == .entity(kind: .artist, id: "art_1", label: "Porter Robinson"))
    #expect(fragments[3] == .skill(label: "Generate album art"))
  }
}

struct EntityChipThumbnailCacheTests {
  @Test func seedsSynchronouslyFromAvatarImageCache() throws {
    let url = URL(string: "https://example.com/chip-\(UUID().uuidString).png")!
    let image = try #require(UIImage(systemName: "music.note"))
    AvatarImageCache.store(image, for: url)

    #expect(AvatarImageCache.image(for: url) === image)
  }
}