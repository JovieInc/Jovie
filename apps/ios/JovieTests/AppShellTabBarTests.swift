import Foundation
import Testing
@testable import Jovie

struct AppShellTabBarTests {
  @Test func primaryBottomTabsAreUnused() {
    #expect(AppShellPanePolicy.primaryBottomTabs().isEmpty)
    #expect(AppShellPanePolicy.showsBottomTabBar() == false)
    #expect(AppShellPrimaryTab.allCases.map(\.shellTab) == [.chat, .library, .calendar, .inbox])
  }

  @Test func noSurfaceIsABottomBarPrimaryTab() {
    #expect(AppShellTab.profile.isPrimaryTab == false)
    #expect(AppShellTab.audience.isPrimaryTab == false)
    #expect(AppShellTab.chat.isPrimaryTab == false)
    #expect(AppShellTab.library.isPrimaryTab == false)
    #expect(AppShellTab.calendar.isPrimaryTab == false)
    #expect(AppShellTab.inbox.isPrimaryTab == false)
  }

  @Test func accessibilityIDsAreStable() {
    #expect(AppShellTab.chat.accessibilityID == "shell-tab-chat")
    #expect(AppShellTab.library.accessibilityID == "shell-tab-library")
    #expect(AppShellTab.calendar.accessibilityID == "shell-tab-calendar")
    #expect(AppShellTab.inbox.accessibilityID == "shell-tab-inbox")
  }

  @Test func gesturePolicyNeverSwitchesTabsFromHorizontalSwipe() {
    #expect(AppShellGesturePolicy.shouldSwitchTabFromHorizontalSwipe() == false)
  }

  @Test func reservedTabBarHeightStaysThumbSized() {
    #expect(AppShellTabBarLayout.barHeight == 56)
    #expect(AppShellTabBarLayout.talkFabSize == 58)
    #expect(AppShellTabBarLayout.talkFabLift == 18)
  }

  @Test func edgeRailDragLocksWhileComposerKeyboardIsVisible() {
    #expect(
      AppShellGesturePolicy.allowsEdgeRailDrag(
        reduceMotion: false,
        isKeyboardVisible: false,
        isShowingTalkOverlay: false,
        hasTeleprompterProposal: false
      )
    )
    #expect(
      AppShellGesturePolicy.allowsEdgeRailDrag(
        reduceMotion: false,
        isKeyboardVisible: true,
        isShowingTalkOverlay: false,
        hasTeleprompterProposal: false
      ) == false
    )
    #expect(
      AppShellGesturePolicy.allowsEdgeRailDrag(
        reduceMotion: true,
        isKeyboardVisible: false,
        isShowingTalkOverlay: false,
        hasTeleprompterProposal: false
      )
    )
    #expect(
      AppShellGesturePolicy.allowsEdgeRailDrag(
        reduceMotion: false,
        isKeyboardVisible: false,
        isShowingTalkOverlay: true,
        hasTeleprompterProposal: false
      ) == false
    )
    #expect(
      AppShellGesturePolicy.allowsEdgeRailDrag(
        reduceMotion: false,
        isKeyboardVisible: false,
        isShowingTalkOverlay: false,
        hasTeleprompterProposal: true
      ) == false
    )
  }

  @Test func leftEdgeOpenRecognizesLeadingEdgeDrag() {
    #expect(
      AppShellGesturePolicy.isLeftEdgeOpen(startX: 12, translationX: 90, predictedX: 100)
    )
    #expect(
      AppShellGesturePolicy.isLeftEdgeOpen(startX: 80, translationX: 90, predictedX: 100)
        == false
    )
  }

  @Test func chatHomeLeadingPanOpensSidebarFromTheCenter() {
    #expect(AppShellGesturePolicy.allowsFullWidthRailSwipe(selectedTab: .chat))
    #expect(AppShellGesturePolicy.allowsFullWidthRailSwipe(selectedTab: .inbox) == false)
    #expect(
      AppShellGesturePolicy.isLeadingSwipeOpen(
        selectedTab: .chat,
        startX: 200,
        translationX: 90,
        predictedX: 130,
        translationY: 8
      )
    )
    #expect(
      AppShellGesturePolicy.isLeadingSwipeOpen(
        selectedTab: .inbox,
        startX: 200,
        translationX: 90,
        predictedX: 130,
        translationY: 8
      ) == false
    )
    #expect(
      AppShellGesturePolicy.isLeadingSwipeOpen(
        selectedTab: .chat,
        startX: 200,
        translationX: 90,
        predictedX: 130,
        translationY: 140
      ) == false
    )
  }

  @Test func chatHomeTrailingPanOpensRightRailFromTheCenter() {
    #expect(
      AppShellGesturePolicy.isTrailingSwipeOpen(
        selectedTab: .chat,
        startX: 200,
        containerWidth: 400,
        translationX: -90,
        predictedX: -130,
        translationY: 6
      )
    )
    #expect(
      AppShellGesturePolicy.isTrailingSwipeOpen(
        selectedTab: .library,
        startX: 200,
        containerWidth: 400,
        translationX: -90,
        predictedX: -130,
        translationY: 6
      ) == false
    )
  }

  @Test func inboxKeepsEdgeOnlyRailDrags() {
    #expect(
      AppShellGesturePolicy.shouldFollowLeadingDrag(
        selectedTab: .inbox,
        startX: 12,
        translationX: 40,
        translationY: 4
      )
    )
    #expect(
      AppShellGesturePolicy.shouldFollowLeadingDrag(
        selectedTab: .inbox,
        startX: 80,
        translationX: 40,
        translationY: 4
      ) == false
    )
    #expect(
      AppShellGesturePolicy.shouldFollowTrailingDrag(
        selectedTab: .inbox,
        startX: 320,
        containerWidth: 400,
        translationX: -40,
        translationY: 4
      ) == false
    )
    #expect(
      AppShellGesturePolicy.shouldFollowTrailingDrag(
        selectedTab: .inbox,
        startX: 380,
        containerWidth: 400,
        translationX: -40,
        translationY: 4
      )
    )
  }

  @Test func chatHomeFollowsFullWidthHorizontalDrags() {
    #expect(
      AppShellGesturePolicy.shouldFollowLeadingDrag(
        selectedTab: .chat,
        startX: 200,
        translationX: 40,
        translationY: 4
      )
    )
    #expect(
      AppShellGesturePolicy.shouldFollowLeadingDrag(
        selectedTab: .chat,
        startX: 200,
        translationX: 40,
        translationY: 35
      )
    )
    #expect(
      AppShellGesturePolicy.isLeadingSwipeOpen(
        selectedTab: .chat,
        startX: 200,
        translationX: 40,
        predictedX: 40,
        translationY: 35
      ) == false
    )
    #expect(
      AppShellGesturePolicy.shouldFollowTrailingDrag(
        selectedTab: .chat,
        startX: 200,
        containerWidth: 400,
        translationX: -40,
        translationY: 4
      )
    )
    #expect(
      AppShellGesturePolicy.shouldFollowTrailingDrag(
        selectedTab: .chat,
        startX: 200,
        containerWidth: 400,
        translationX: -18,
        translationY: 40
      ) == false
    )
  }

  @Test func rightEdgeOpenRecognizesTrailingEdgeDrag() {
    #expect(
      AppShellGesturePolicy.isRightEdgeOpen(
        startX: 390,
        containerWidth: 400,
        translationX: -90,
        predictedX: -130
      )
    )
    #expect(
      AppShellGesturePolicy.isRightEdgeOpen(
        startX: 200,
        containerWidth: 400,
        translationX: -90,
        predictedX: -130
      ) == false
    )
  }

  @Test func homeSurfaceIsChatWhenChatEnabled() {
    #expect(appShellHomeSurface(chatEnabled: true) == .chat)
    #expect(AppShellPanePolicy.homeSurface(chatEnabled: true) == .chat)
    #expect(appShellHomeSurface(chatEnabled: false) == .profile)
  }

  @Test func leadingSwipeOpensSidebarAndTrailingSwipeOpensRail() {
    #expect(AppShellPanePolicy.paneAfterLeadingSwipe(current: .none) == .sidebar)
    #expect(AppShellPanePolicy.paneAfterTrailingSwipe(current: .none) == .rail)
    #expect(AppShellPanePolicy.paneAfterLeadingSwipe(current: .rail) == .sidebar)
    #expect(AppShellPanePolicy.paneAfterTrailingSwipe(current: .sidebar) == .rail)
    #expect(AppShellPanePolicy.paneAfterDismiss() == .none)
  }

  @Test func sidebarHoldsFormerBottomDestinations() {
    let destinations = AppShellPanePolicy.sidebarDestinations(
      chatEnabled: true,
      audienceEnabled: true
    )
    #expect(destinations == [.chat, .library, .calendar, .inbox, .profile, .audience])
    #expect(
      AppShellPanePolicy.sidebarDestinations(chatEnabled: false, audienceEnabled: false)
        == [.library, .calendar, .inbox, .profile]
    )
  }

  @Test func resolveInitialTabKeepsFixtureDestinationWhenChatEnabled() {
    #expect(resolveShellInitialTab(.library, chatEnabled: true) == .library)
    #expect(resolveShellInitialTab(.calendar, chatEnabled: true) == .calendar)
    #expect(resolveShellInitialTab(.inbox, chatEnabled: true) == .inbox)
  }

  @Test func resolveInitialTabFallsToProfileWhenChatDisabled() {
    #expect(resolveShellInitialTab(.library, chatEnabled: false) == .profile)
    #expect(resolveShellInitialTab(.chat, chatEnabled: false) == .profile)
  }
}

struct AppShellDrawerProfilePolicyTests {
  @Test func profileSurfaceAlwaysOpensDashboard() {
    #expect(AppShellDrawerProfilePolicy.profileSurfaceOpensDashboard())
  }

  @Test func accountHeaderOpensEmbeddedBrowserWhenURLExists() {
    #expect(
      AppShellDrawerProfilePolicy.accountHeaderOpensEmbeddedPublicProfile(
        publicProfileURL: "https://jov.ie/tim"
      )
    )
    #expect(
      AppShellDrawerProfilePolicy.accountHeaderOpensEmbeddedPublicProfile(
        publicProfileURL: nil
      ) == false
    )
  }
}

struct SharedPressFeedbackStyleTests {
  @Test func canonicalButtonStylesExposeTheirPressedStateAndTargetContracts() {
    #expect(JoviePillButtonStyle.pressedOpacity == 0.8)
    #expect(JovieIconButtonStyle.pressedOpacity == 0.72)
    #expect(JovieIconButtonStyle.targetSize == 44)
    #expect(JoviePressFeedbackButtonStyle.defaultPressedOpacity == 0.72)
    #expect(SettingsInteraction.rowPressedOpacity == 0.7)
  }
}

struct LibraryFeedTests {
  @Test func savingAVlogLandsOnCollectionsNotCatalog() {
    #expect(LibraryLandingPolicy.defaultHome() == .catalog)
    #expect(LibraryLandingPolicy.homeAfterSavingVlog() == .collections)
  }

  @Test func homesAreCatalogCollectionsIdeasWithStableA11y() {
    #expect(LibraryHome.allCases.map(\.id) == ["catalog", "collections", "ideas"])
    #expect(LibraryHome.allCases.map(\.title) == ["Catalog", "Collections", "Ideas"])
    #expect(LibraryHome.catalog.accessibilityIdentifier == "library-home-catalog")
    #expect(LibraryHome.collections.accessibilityIdentifier == "library-home-collections")
    #expect(LibraryHome.ideas.accessibilityIdentifier == "library-home-ideas")
  }

  @Test func searchMatchesCatalogNameAndIgnoresTakes() {
    let hits = LibraryFeed.matching(LibraryFeed.previewAssets, query: "midnight")
    #expect(hits.map(\.id) == ["lib-release-midnight"])
    #expect(LibraryFeed.matching(LibraryFeed.previewAssets, query: "   ").count == LibraryFeed.previewAssets.count)
  }

  @Test func filterAllReturnsEveryAsset() {
    let assets = LibraryFeed.previewAssets
    #expect(LibraryFeed.filtered(assets: assets, filter: .all).count == assets.count)
  }

  @Test func filterByTypeNarrowsFeed() {
    let assets = LibraryFeed.previewAssets
    let releases = LibraryFeed.filtered(assets: assets, filter: .type(.release))
    #expect(releases.allSatisfy { $0.type == .release })
    #expect(releases.isEmpty == false)
  }

  @Test func filterChipsLeadWithAll() {
    #expect(LibraryFilter.catalogChips.first == .all)
    #expect(LibraryFilter.catalogChips.map(\.id) == ["all", "release", "merch", "press"])
    #expect(LibraryFilter.catalogChips.contains { $0.id == "smartLink" } == false)
  }

  @Test func catalogHidesVideosAndSmartLinkRows() {
    let mixed = LibraryFeed.previewAssets + [
      LibraryAsset(
        id: "vlog-ferry",
        name: "Ferry vlog",
        type: .video,
        isPublic: false,
        coverURL: nil,
        liveStatLabel: "Recorded just now",
        publicURL: nil
      ),
    ]
    let catalog = LibraryFeed.catalog(assets: mixed, filter: .all)
    #expect(catalog.allSatisfy { LibraryFeed.catalogTypes.contains($0.type) })
    #expect(catalog.contains { $0.id == "lib-release-midnight" })
    #expect(catalog.contains { $0.id == "vlog-ferry" } == false)
  }

  @Test func collectionsGroupTakesByScriptTitle() {
    let takes = [
      LibraryAsset(
        id: "a",
        name: "Ferry vlog",
        type: .video,
        isPublic: false,
        coverURL: nil,
        liveStatLabel: "now",
        publicURL: nil
      ),
      LibraryAsset(
        id: "b",
        name: "Ferry vlog",
        type: .video,
        isPublic: false,
        coverURL: nil,
        liveStatLabel: "now",
        publicURL: nil
      ),
      LibraryAsset(
        id: "c",
        name: "Studio dump",
        type: .video,
        isPublic: false,
        coverURL: nil,
        liveStatLabel: "now",
        publicURL: nil
      ),
    ]
    let grouped = LibraryFeed.collections(from: takes)
    #expect(grouped.count == 2)
    #expect(grouped[0].name == "Ferry vlog")
    #expect(grouped[0].count == 2)
    #expect(grouped[1].name == "Studio dump")
  }

  @Test func emptyAssetsStayEmptyForEveryChip() {
    for chip in LibraryFilter.chips {
      #expect(LibraryFeed.filtered(assets: [], filter: chip).isEmpty)
    }
  }
}

struct LibraryItemScreenTests {
  @Test func catalogTapOpensDedicatedScreenNotSheet() {
    let asset = LibraryFeed.previewAssets[0]
    #expect(LibraryItemPresentationPolicy.presentation(for: asset) == .dedicatedScreen)
    #expect(LibraryItemPresentationPolicy.shouldOpenSheet(for: asset) == false)
    #expect(LibraryItemPresentationPolicy.usesExistingRails())
    #expect(AppShellPanePolicy.showsBottomTabBar() == false)
  }

  @Test func localVideoOpensDedicatedScreenNotPlayerSheet() {
    let asset = LibraryAsset(
      id: "vlog-ferry",
      name: "Ferry vlog",
      type: .video,
      isPublic: false,
      coverURL: nil,
      liveStatLabel: "Recorded just now",
      publicURL: nil,
      localVideoURL: URL(fileURLWithPath: "/tmp/ferry.mp4")
    )
    #expect(LibraryItemPresentationPolicy.presentation(for: asset) == .dedicatedScreen)
    #expect(LibraryItemPresentationPolicy.shouldOpenSheet(for: asset) == false)
  }

  @Test func itemScreenReusesExistingLeftAndRightPanes() {
    #expect(LibraryItemPresentationPolicy.usesExistingRails())
    #expect(AppShellPanePolicy.paneAfterLeadingSwipe(current: .none) == .sidebar)
    #expect(AppShellPanePolicy.paneAfterTrailingSwipe(current: .none) == .rail)
    #expect(AppShellPanePolicy.paneAfterDismiss() == .none)
  }

  @Test func entityMappingKeepsReleaseKindAndLabel() {
    let asset = LibraryFeed.previewAssets[0]
    let item = EntityContextItem.fromLibraryAsset(asset)
    #expect(item.kind == .release)
    #expect(item.entityID == "lib-release-midnight")
    #expect(item.label == "Midnight Drive")
    #expect(item.id == "release:lib-release-midnight")
  }

  @Test func merchMapsToTrackEntityWithoutInventingAKind() {
    let asset = LibraryFeed.previewAssets[1]
    let item = EntityContextItem.fromLibraryAsset(asset)
    #expect(asset.type == .merch)
    #expect(item.kind == .track)
    #expect(item.label == "Tour Tee")
  }

  @Test func accessibilityIdentifiersStayStable() {
    #expect(LibraryItemScreenMetrics.accessibilityIdentifier == "library-item-screen")
    #expect(LibraryItemScreenMetrics.backAccessibilityIdentifier == "library-item-back")
    #expect(LibraryItemScreenMetrics.titleAccessibilityIdentifier == "library-item-title")
    #expect(LibraryItemScreenMetrics.coverSize == 72)
    #expect(abs(LibraryItemScreenMetrics.videoAspect - (16.0 / 9.0)) < 0.000_001)
  }

  @Test func screenIdentifierDoesNotClobberChildIdentifiers() {
    // The screen container must stay a passthrough container or its
    // identifier propagates to the back button/title and XCUITest can no
    // longer find `library-item-back` (ci:901f6f5b1c61b0c7fd39).
    #expect(LibraryItemScreenMetrics.requiresPassthroughAccessibilityContainer)
  }
}

struct LibraryInboxCalendarLaunchModeTests {
  @Test func libraryArgumentsParseToLibraryFixtures() {
    #expect(LaunchMode.resolving(arguments: ["-ui-testing-library"], isXCTest: false) == .uiTestingLibrary)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-library-empty"], isXCTest: false)
        == .uiTestingLibraryEmpty
    )
    #expect(LaunchMode.uiTestingLibrary.defaultInitialTab == .library)
    #expect(LaunchMode.uiTestingLibraryEmpty.defaultInitialTab == .library)
    #expect(LaunchMode.uiTestingLibrary.usesEmptyLibraryPreview == false)
    #expect(LaunchMode.uiTestingLibraryEmpty.usesEmptyLibraryPreview)
  }

  @Test func inboxArgumentsParseToInboxFixtures() {
    #expect(LaunchMode.resolving(arguments: ["-ui-testing-inbox"], isXCTest: false) == .uiTestingInbox)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-inbox-offline"], isXCTest: false)
        == .uiTestingInboxOffline
    )
    #expect(LaunchMode.uiTestingInbox.defaultInitialTab == .inbox)
    #expect(LaunchMode.uiTestingInboxOffline.defaultInitialTab == .inbox)
    #expect(LaunchMode.uiTestingInbox.usesLiveAuth == false)
    #expect(LaunchMode.uiTestingInboxOffline.usesLiveAuth == false)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-inbox-loading"], isXCTest: false)
        == .uiTestingInboxLoading
    )
    #expect(LaunchMode.uiTestingInboxLoading.defaultInitialTab == .inbox)
    #expect(LaunchMode.uiTestingInboxLoading.holdsActionLoopLoading)
    #expect(LaunchMode.uiTestingInbox.holdsActionLoopLoading == false)
  }

  @Test func calendarArgumentsParseToCalendarFixtures() {
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-calendar"], isXCTest: false)
        == .uiTestingCalendar
    )
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-calendar-offline"], isXCTest: false)
        == .uiTestingCalendarOffline
    )
    #expect(LaunchMode.uiTestingCalendar.defaultInitialTab == .calendar)
    #expect(LaunchMode.uiTestingCalendarOffline.defaultInitialTab == .calendar)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-calendar-loading"], isXCTest: false)
        == .uiTestingCalendarLoading
    )
    #expect(LaunchMode.uiTestingCalendarLoading.defaultInitialTab == .calendar)
    #expect(LaunchMode.uiTestingCalendarLoading.holdsActionLoopLoading)
  }
}

struct EntityContextTests {
  @Test func entityIDIsStableKindPlusID() {
    let item = EntityContextItem(kind: .release, entityID: "rel_1", label: "Midnight Drive")
    #expect(item.id == "release:rel_1")
    #expect(item.kindTitle == "Release")
    #expect(item.publicURL.contains("rel_1"))
  }

  @Test func statsSnapshotIsDeterministicForSameID() {
    let item = EntityContextItem(kind: .track, entityID: "trk_42", label: "Demo")
    let a = EntityContextStats.snapshot(for: item)
    let b = EntityContextStats.snapshot(for: item)
    #expect(a == b)
  }
}
