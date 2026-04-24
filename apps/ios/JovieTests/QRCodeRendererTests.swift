import Testing
@testable import Jovie

struct QRCodeRendererTests {
  @Test func rendersQRCodeForValidPayload() {
    let image = QRCodeRenderer.image(for: "https://jov.ie/djshadow")
    #expect(image != nil)
  }
}
