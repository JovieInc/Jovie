import Testing
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
}
