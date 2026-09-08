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
  private let policy = PublicProfileURLPolicy(publicProfileURL: "https://jov.ie/tim")!

  @Test func acceptsConfiguredHTTPSProfileAndItsPublicSubroutes() {
    #expect(policy.validatedURL(from: "https://jov.ie/tim") == URL(string: "https://jov.ie/tim"))
    #expect(
      policy.validatedURL(from: "https://jov.ie/tim/summer-tour/sounds?source=app#latest")
        == URL(string: "https://jov.ie/tim/summer-tour/sounds?source=app#latest")
    )
  }

  @Test func rejectsHTTPUnrelatedHostsAndCrossTenantProfiles() {
    #expect(policy.validatedURL(from: "http://jov.ie/tim") == nil)
    #expect(policy.validatedURL(from: "https://example.com/tim") == nil)
    #expect(policy.validatedURL(from: "https://jov.ie/another-artist") == nil)
    #expect(policy.validatedURL(from: "about:blank") == nil)
    #expect(policy.validatedURL(from: nil) == nil)
  }

  @Test func rejectsInvalidConfiguredBaseURL() {
    #expect(PublicProfileURLPolicy(webBaseURL: URL(string: "http://jov.ie/tim")!) == nil)
    #expect(PublicProfileURLPolicy(webBaseURL: URL(string: "https://jov.ie")!) == nil)
    #expect(PublicProfileURLPolicy(publicProfileURL: "https://example.com/tim") == nil)
  }

  @Test func acceptsPublicProfileURLHostEvenWhenAppBaseIsLAN() {
    let policy = PublicProfileURLPolicy(publicProfileURL: "https://jov.ie/tim")
    #expect(policy?.validatedURL(from: "https://jov.ie/tim") == URL(string: "https://jov.ie/tim"))
  }

  @Test func acceptsStagingHostPublicProfiles() {
    let policy = PublicProfileURLPolicy(publicProfileURL: "https://staging.jov.ie/tim")
    #expect(
      policy?.validatedURL(from: "https://staging.jov.ie/tim")
        == URL(string: "https://staging.jov.ie/tim")
    )
  }

  @Test func rejectsOperatorAdminAndAppDestinationsEvenOnTheAllowedHost() {
    for path in [
      "/app",
      "/app/ov/chat",
      "/admin",
      "/hud",
      "/hud-tv",
      "/api/mobile/v1/me",
      "/auth/start",
      "/changelog",
      "/about",
      "/waitlist",
      "/__clerk",
      "/onboarding",
    ] {
      #expect(PublicProfileURLPolicy(publicProfileURL: "https://jov.ie\(path)") == nil)
      #expect(policy.validatedURL(from: "https://jov.ie\(path)") == nil)
    }
  }

  @Test func rejectsUnsafeOrOverdeepPublicProfilePaths() {
    #expect(policy.validatedURL(from: "https://jov.ie/tim/a/b/c/d") == nil)
    #expect(policy.validatedURL(from: "https://jov.ie/tim/%5Cadmin") == nil)
    #expect(policy.validatedURL(from: "https://jov.ie/tim/%2F%2Fadmin") == nil)
  }

  @Test @MainActor func publicBrowserUsesAnIsolatedNonPersistentDataStore() {
    let url = URL(string: "https://jov.ie/tim")!
    let model = PublicProfileBrowserModel(initialURL: url, policy: policy)
    #expect(model.webView.configuration.websiteDataStore.isPersistent == false)
    #expect(model.webView.configuration.allowsInlineMediaPlayback)
    #expect(model.webView.configuration.mediaTypesRequiringUserActionForPlayback.isEmpty)
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
