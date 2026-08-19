import SwiftUI

/// Library homes: Catalog (releases/merch/docs), Collections (auto-bundled
/// takes), Ideas (untagged dumps). Full-width native list. Smart links are
/// not a filter.
struct LibrarySurfaceView: View {
  let assets: [LibraryAsset]
  @Binding var home: LibraryHome
  let onSelectAsset: (LibraryAsset) -> Void
  @State private var filter: LibraryFilter = .all
  @State private var query = ""
  @State private var localVideoAssets: [LibraryAsset] = []
  @State private var openCollection: LibraryCollection?

  private var catalogAssets: [LibraryAsset] {
    LibraryFeed.matching(
      LibraryFeed.catalog(assets: assets, filter: filter),
      query: query
    )
  }

  private var collections: [LibraryCollection] {
    LibraryFeed.matchingCollections(
      LibraryFeed.collections(from: localVideoAssets),
      query: query
    )
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(alignment: .leading, spacing: 0) {
        if let openCollection {
          collectionHeader(openCollection)
        } else {
          homeSwitcher
          searchField
          if home == .catalog {
            catalogChips
          }
        }

        listBody
      }
    }
    .accessibilityIdentifier("library-surface")
    .scrollDismissesKeyboard(.interactively)
    .task {
      await reloadLocalVideos()
    }
  }

  private var listBody: some View {
    Group {
      if let openCollection {
        takeList(openCollection.items)
      } else {
        switch home {
        case .catalog:
          assetList(catalogAssets, emptyTitle: "No assets in this filter.")
        case .collections:
          collectionList
        case .ideas:
          ideasEmpty
        }
      }
    }
  }

  private var homeSwitcher: some View {
    HStack(spacing: JovieSpacing.small) {
      ForEach(LibraryHome.allCases) { segment in
        Button {
          home = segment
          openCollection = nil
        } label: {
          Text(segment.title)
            .font(JovieFont.body(size: 13, weight: .semibold))
            .foregroundStyle(
              home == segment ? JovieColor.backgroundBase : JovieColor.textSecondary
            )
            .padding(.horizontal, JovieSpacing.medium)
            .padding(.vertical, 8)
            .background(
              home == segment ? Color.white : JovieColor.surface1,
              in: Capsule()
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(home == segment ? [.isSelected] : [])
        .accessibilityIdentifier(segment.accessibilityIdentifier)
      }
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.top, JovieSpacing.medium)
    .padding(.bottom, JovieSpacing.small)
  }

  private var searchField: some View {
    TextField("Search \(home.title.lowercased())", text: $query)
      .font(JovieFont.body(size: 15))
      .foregroundStyle(JovieColor.textPrimary)
      .padding(.horizontal, JovieSpacing.medium)
      .frame(height: 36)
      .background(JovieColor.surface1, in: Capsule())
      .overlay {
        Capsule().stroke(JovieColor.borderSubtle, lineWidth: 1)
      }
      .padding(.horizontal, JovieSpacing.large)
      .padding(.bottom, JovieSpacing.small)
      .accessibilityIdentifier("library-search")
  }

  private var catalogChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: JovieSpacing.small) {
        ForEach(LibraryFilter.catalogChips) { chip in
          Button {
            filter = chip
          } label: {
            Text(chip.title)
              .font(JovieFont.body(size: 13, weight: .semibold))
              .foregroundStyle(
                filter == chip ? JovieColor.backgroundBase : JovieColor.textSecondary
              )
              .padding(.horizontal, JovieSpacing.medium)
              .padding(.vertical, 8)
              .background(
                filter == chip ? Color.white : JovieColor.surface1,
                in: Capsule()
              )
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(filter == chip ? [.isSelected] : [])
          .accessibilityIdentifier("library-filter-\(chip.id)")
        }
      }
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.bottom, JovieSpacing.small)
    .accessibilityIdentifier("library-filters")
  }

  private func collectionHeader(_ collection: LibraryCollection) -> some View {
    HStack(spacing: JovieSpacing.medium) {
      Button {
        openCollection = nil
      } label: {
        Image(systemName: "chevron.left")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .frame(width: 44, height: 44)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Back to collections")
      .accessibilityIdentifier("library-collection-back")

      VStack(alignment: .leading, spacing: 2) {
        Text(collection.name)
          .font(JovieFont.display(size: 20))
          .foregroundStyle(JovieColor.textPrimary)
        Text(collection.subtitle)
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.top, JovieSpacing.small)
    .padding(.bottom, JovieSpacing.small)
  }

  @ViewBuilder
  private func assetList(_ items: [LibraryAsset], emptyTitle: String) -> some View {
    if items.isEmpty {
      emptyState(title: emptyTitle, detail: emptyDetail)
    } else {
      ScrollView {
        LazyVStack(spacing: 0) {
          ForEach(items) { asset in
            LibraryAssetRow(asset: asset) {
              onSelectAsset(asset)
            }
          }
        }
        .padding(.bottom, JovieSpacing.xxLarge)
      }
    }
  }

  @ViewBuilder
  private func takeList(_ items: [LibraryAsset]) -> some View {
    let visible = LibraryFeed.matching(items, query: query)
    assetList(visible, emptyTitle: "No takes in this collection.")
  }

  private var collectionList: some View {
    Group {
      if collections.isEmpty {
        emptyState(
          title: "No collections yet.",
          detail: "A script and the takes that match it land here together."
        )
      } else {
        ScrollView {
          LazyVStack(spacing: 0) {
            ForEach(collections) { collection in
              Button {
                if collection.items.count == 1, let only = collection.items.first {
                  onSelectAsset(only)
                } else {
                  openCollection = collection
                }
              } label: {
                LibraryCollectionRow(collection: collection)
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("library-collection-\(collection.id)")
            }
          }
          .padding(.bottom, JovieSpacing.xxLarge)
        }
      }
    }
  }

  private var ideasEmpty: some View {
    emptyState(
      title: "No ideas yet.",
      detail: "Rough dumps land here untyped. Say “song idea” to tag one, or we suggest a link when a lyric matches."
    )
  }

  private var emptyDetail: String {
    switch home {
    case .catalog:
      return "Switch filters or add assets from chat."
    case .collections:
      return "A script and the takes that match it land here together."
    case .ideas:
      return "Rough dumps land here untyped."
    }
  }

  private func emptyState(title: String, detail: String) -> some View {
    VStack(spacing: JovieSpacing.medium) {
      Spacer(minLength: 80)
      Text(title)
        .font(JovieFont.body(size: 16, weight: .medium))
        .foregroundStyle(JovieColor.textSecondary)
      Text(detail)
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textTertiary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, JovieSpacing.xLarge)
      Spacer(minLength: 80)
    }
    .frame(maxWidth: .infinity)
    .accessibilityIdentifier("library-empty")
  }

  private func reloadLocalVideos() async {
    let store = VlogSessionStore.localDocuments()
    let sessions = await Task.detached {
      store.recent()
    }.value
    localVideoAssets = LibraryVlogVideos.assets(from: sessions, store: store)
  }
}

private struct LibraryAssetRow: View {
  let asset: LibraryAsset
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        cover
        VStack(alignment: .leading, spacing: 2) {
          Text(asset.name)
            .font(JovieFont.body(size: 16, weight: .medium))
            .foregroundStyle(JovieColor.textPrimary)
            .lineLimit(1)
          Text(subtitle)
            .font(JovieFont.body(size: 12))
            .foregroundStyle(JovieColor.textTertiary)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, JovieSpacing.large)
      .padding(.vertical, 11)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(JovieColor.borderSubtle)
        .frame(height: 1)
        .padding(.leading, 64)
    }
    .accessibilityIdentifier("library-asset-\(asset.id)")
    .accessibilityLabel("\(asset.name), \(asset.typeBadge), \(asset.visibilityBadge)")
  }

  private var subtitle: String {
    var parts = [asset.typeBadge, asset.liveStatLabel]
    if let link = asset.jovieLinkLabel {
      parts.append(link)
    }
    return parts.joined(separator: " · ")
  }

  private var cover: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 4, style: .continuous)
        .fill(JovieColor.surface2)
      if let coverURL = asset.coverURL {
        CachedRemoteImageView(imageURL: coverURL, size: 36) {
          Image(systemName: "photo")
            .foregroundStyle(JovieColor.textTertiary)
        }
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
      } else {
        Image(systemName: coverSymbol)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
    .frame(width: 36, height: 36)
  }

  private var coverSymbol: String {
    switch asset.type {
    case .release: return "opticaldisc"
    case .merch: return "tshirt"
    case .smartLink: return "link"
    case .photo: return "photo"
    case .press: return "doc.richtext"
    case .video: return "video.fill"
    }
  }
}

private struct LibraryCollectionRow: View {
  let collection: LibraryCollection

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      RoundedRectangle(cornerRadius: 4, style: .continuous)
        .fill(JovieColor.surface2)
        .frame(width: 48, height: 32)
        .overlay {
          Image(systemName: "square.stack")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(JovieColor.textTertiary)
        }
      VStack(alignment: .leading, spacing: 2) {
        Text(collection.name)
          .font(JovieFont.body(size: 16, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)
        Text(collection.subtitle)
          .font(JovieFont.body(size: 12))
          .foregroundStyle(JovieColor.textTertiary)
      }
      Spacer(minLength: 0)
      Text("\(collection.count)")
        .font(JovieFont.body(size: 13))
        .foregroundStyle(JovieColor.textTertiary)
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, 11)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(JovieColor.borderSubtle)
        .frame(height: 1)
        .padding(.leading, 76)
    }
    .accessibilityLabel("\(collection.name), \(collection.subtitle)")
  }
}
