// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "JovieKit",
  platforms: [.iOS("18.0"), .macOS(.v14)],
  products: [.library(name: "JovieKit", targets: ["JovieKit"])],
  targets: [
    .target(name: "JovieKit"),
    .testTarget(name: "JovieKitTests", dependencies: ["JovieKit"]),
  ],
  swiftLanguageModes: [.v5]
)
