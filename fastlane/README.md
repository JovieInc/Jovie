fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios ios_tests

```sh
[bundle exec] fastlane ios ios_tests
```

Run unsigned iOS simulator tests

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Capture core iOS flow screenshots from simulator

### ios bootstrap_signing

```sh
[bundle exec] fastlane ios bootstrap_signing
```

Create or refresh App Store signing assets in match storage

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Archive and upload an internal TestFlight build

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
