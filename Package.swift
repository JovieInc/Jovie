// swift-tools-version: 6.0
import PackageDescription

// Git-consumable entry point to the existing canonical JovieKit source.
// Keep the local Xcode package and external consumers on the same files.
let package = Package(
  name: "JovieKit",
  platforms: [.iOS("18.0"), .macOS(.v14)],
  products: [.library(name: "JovieKit", targets: ["JovieKit"])],
  targets: [
    .target(name: "JovieKit", path: "apps/ios/Packages/JovieKit/Sources/JovieKit"),
    .testTarget(name: "JovieKitTests", dependencies: ["JovieKit"],
                path: "apps/ios/Packages/JovieKit/Tests/JovieKitTests"),
  ],
  swiftLanguageModes: [.v5]
)
