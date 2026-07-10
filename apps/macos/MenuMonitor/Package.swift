// swift-tools-version: 5.10
import PackageDescription

let package = Package(
  name: "MenuMonitor",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .executable(name: "MenuMonitor", targets: ["MenuMonitor"]),
  ],
  targets: [
    .executableTarget(
      name: "MenuMonitor",
      path: "Sources/MenuMonitor"
    ),
  ]
)
