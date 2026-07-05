// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ShippingMenuBar",
    platforms: [
        .macOS(.v14), // MenuBarExtra requires macOS 13+
    ],
    targets: [
        .executableTarget(
            name: "ShippingMenuBar",
            path: "Sources",
            sources: ["ShippingMenuBar.swift"]
        ),
    ]
)
