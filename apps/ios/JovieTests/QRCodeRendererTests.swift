import Testing
import UIKit
@testable import Jovie

struct QRCodeRendererTests {
  @Test func rendersQRCodeForValidPayload() {
    let image = QRCodeRenderer.image(for: "https://jov.ie/tim")
    #expect(image != nil)
  }

  @Test func reusesCachedImageForSamePayloadAndScale() throws {
    QRCodeRenderer.clearCache()

    let first = try #require(QRCodeRenderer.image(for: "https://jov.ie/tim"))
    let second = try #require(QRCodeRenderer.image(for: "https://jov.ie/tim"))

    #expect(first === second)
  }

  @Test func skipsEmptyPayloads() {
    #expect(QRCodeRenderer.image(for: "") == nil)
  }

  @Test func qrPlateStyleUsesSystemBTokens() {
    #expect(JovieQRCodePlate.padding == JovieSpacing.xLarge)
    #expect(JovieQRCodePlate.radius == JovieRadius.large)
  }

  @Test func cachedImageMissesBeforeRenderAndHitsAfterAsyncRender() async throws {
    QRCodeRenderer.clearCache()
    let payload = "https://jov.ie/async-\(UUID().uuidString)"

    #expect(QRCodeRenderer.cachedImage(for: payload) == nil)

    let rendered = try #require(await QRCodeRenderer.imageAsync(for: payload))
    let cached = try #require(QRCodeRenderer.cachedImage(for: payload))

    // Async render populates the same cache the synchronous path uses.
    #expect(rendered === cached)
  }

  @Test func cachedImageSkipsEmptyPayloads() {
    #expect(QRCodeRenderer.cachedImage(for: "") == nil)
  }
}

struct PublicProfileURLPolicyTests {
  private let policy = PublicProfileURLPolicy(webBaseURL: URL(string: "https://jov.ie")!)!

  @Test func acceptsConfiguredHTTPSHost() {
    #expect(policy.validatedURL(from: "https://jov.ie/tim") == URL(string: "https://jov.ie/tim"))
  }

  @Test func rejectsHTTPAndUnrelatedHosts() {
    #expect(policy.validatedURL(from: "http://jov.ie/tim") == nil)
    #expect(policy.validatedURL(from: "https://example.com/tim") == nil)
    #expect(policy.validatedURL(from: nil) == nil)
  }

  @Test func rejectsInvalidConfiguredBaseURL() {
    #expect(PublicProfileURLPolicy(webBaseURL: URL(string: "http://jov.ie")!) == nil)
  }
}

struct AvatarImageCacheTests {
  @Test func storesAndReturnsDecodedImageForURL() throws {
    let url = URL(string: "https://example.com/avatar-\(UUID().uuidString).png")!
    #expect(AvatarImageCache.image(for: url) == nil)

    let image = try #require(UIImage(systemName: "person.crop.circle"))
    AvatarImageCache.store(image, for: url)

    #expect(AvatarImageCache.image(for: url) === image)
  }

  @Test func distinctURLsDoNotCollide() throws {
    let first = URL(string: "https://example.com/a-\(UUID().uuidString).png")!
    let second = URL(string: "https://example.com/b-\(UUID().uuidString).png")!
    let image = try #require(UIImage(systemName: "person.crop.circle"))

    AvatarImageCache.store(image, for: first)

    #expect(AvatarImageCache.image(for: first) === image)
    #expect(AvatarImageCache.image(for: second) == nil)
  }
}
