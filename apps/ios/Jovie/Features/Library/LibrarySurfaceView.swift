import SwiftUI

/// Mobile Library storefront (JOV-3637): vertical rich asset cards + filter chips.
struct LibrarySurfaceView: View {
  let assets: [LibraryAsset]
  let onSelectAsset: (LibraryAsset) -> Void

  @State private var filter: LibraryFilter = .all

  private var filteredAssets: [LibraryAsset] {
    LibraryFeed.filtered(assets: assets, filter: filter)
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(alignment: .leading, spacing: 0) {
        filterChips
          .padding(.horizontal, JovieSpacing.large)
          .padding(.top, JovieSpacing.medium)
          .padding(.bottom, JovieSpacing.small)

        if filteredAssets.isEmpty {
          emptyState
        } else {
          ScrollView {
            LazyVStack(spacing: JovieSpacing.medium) {
              ForEach(filteredAssets) { asset in
                LibraryAssetCard(asset: asset) {
                  onSelectAsset(asset)
                }
              }
            }
            .padding(.horizontal, JovieSpacing.large)
            .padding(.bottom, JovieSpacing.xxLarge)
          }
        }
      }
    }
    .accessibilityIdentifier("library-surface")
  }

  private var filterChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: JovieSpacing.small) {
        ForEach(LibraryFilter.chips) { chip in
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
    .accessibilityIdentifier("library-filters")
  }

  private var emptyState: some View {
    VStack(spacing: JovieSpacing.medium) {
      Spacer(minLength: 80)
      Text("No assets in this filter.")
        .font(JovieFont.body(size: 16, weight: .medium))
        .foregroundStyle(JovieColor.textSecondary)
      Text("Switch filters or add assets from chat.")
        .font(JovieFont.body(size: 14))
        .foregroundStyle(JovieColor.textTertiary)
      Spacer(minLength: 80)
    }
    .frame(maxWidth: .infinity)
    .accessibilityIdentifier("library-empty")
  }
}

private struct LibraryAssetCard: View {
  let asset: LibraryAsset
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        cover
        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text(asset.name)
            .font(JovieFont.body(size: 16, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
            .lineLimit(1)

          HStack(spacing: JovieSpacing.small) {
            badge(asset.typeBadge)
            badge(asset.visibilityBadge)
          }

          Text(asset.liveStatLabel)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
      }
      .padding(JovieSpacing.medium)
      .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
          .stroke(JovieColor.borderSubtle, lineWidth: 1)
      }
    }
    .buttonStyle(LibraryCardButtonStyle())
    .accessibilityIdentifier("library-asset-\(asset.id)")
    .accessibilityLabel("\(asset.name), \(asset.typeBadge), \(asset.visibilityBadge)")
  }

  private var cover: some View {
    ZStack {
      RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
        .fill(JovieColor.surface2)
      if let coverURL = asset.coverURL {
        CachedRemoteImageView(imageURL: coverURL, size: 64) {
          Image(systemName: "photo")
            .foregroundStyle(JovieColor.textTertiary)
        }
        .clipShape(RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
      } else {
        Image(systemName: coverSymbol)
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
    .frame(width: 64, height: 64)
  }

  private var coverSymbol: String {
    switch asset.type {
    case .release: return "opticaldisc"
    case .merch: return "tshirt"
    case .smartLink: return "link"
    case .photo: return "photo"
    case .press: return "doc.richtext"
    }
  }

  private func badge(_ text: String) -> some View {
    Text(text)
      .font(JovieFont.body(size: 11, weight: .semibold))
      .foregroundStyle(JovieColor.textSecondary)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(JovieColor.surface2, in: Capsule())
  }
}

private struct LibraryCardButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.8 : 1)
      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}
