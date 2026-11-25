// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "SmartDemo",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "SmartDemo", path: "Sources/SmartDemo")
    ]
)
