import SwiftUI

struct MobileChatMerchOptionsView: View {
  let artifact: MobileChatMerchArtifact
  let onSelectPrompt: (String) -> Void

  var body: some View {
    switch artifact {
    case let .productOptions(payload):
      merchSection(
        title: "Merch Options",
        subtitle: payload.nextStep ?? "Pick one to save it to Library"
      ) {
        ForEach(payload.options) { option in
          merchCard {
            mockupImage(
              url: option.mockupURL,
              label: option.designName,
              accent: merchAccent(for: option.optionNumber)
            )
            .overlay(alignment: .topLeading) {
              optionBadge(option.optionNumber)
            }

            Text(option.designName)
              .font(JovieFont.body(size: 14, weight: .semibold))
              .foregroundStyle(JovieColor.textPrimary)
              .lineLimit(1)

            Text(productSubtitle(option))
              .font(JovieFont.body(size: 12))
              .foregroundStyle(JovieColor.textTertiary)
              .lineLimit(1)

            Text(option.concept)
              .font(JovieFont.body(size: 12))
              .foregroundStyle(JovieColor.textSecondary)
              .lineLimit(3)
              .frame(minHeight: 48, alignment: .topLeading)

            if let salePrice = option.salePrice {
              Text(salePrice)
                .font(JovieFont.body(size: 13, weight: .semibold))
                .foregroundStyle(JovieColor.textPrimary)
            }

            merchButton("Save") {
              onSelectPrompt(
                "Select merch option \(option.optionNumber) from generation \(payload.generationId)."
              )
            }
          }
          .accessibilityLabel("\(option.designName), option \(option.optionNumber)")
        }
      }
    case let .designCarousel(payload):
      merchSection(
        title: "Merch Designs",
        subtitle: payload.nextStep ?? "Pick one and I'll put it on products"
      ) {
        ForEach(payload.designs) { design in
          merchCard {
            mockupImage(
              url: design.previewURL,
              label: design.designName,
              accent: merchAccent(for: design.optionNumber)
            )
            .overlay {
              // The mockup square keeps a fixed `aspectRatio(1)` footprint
              // (see `mockupImage`) in every state, so this overlay only
              // needs an opacity crossfade -- no size/position ever moves
              // when "Rendering" clears.
              if !design.isReady {
                VStack(spacing: JovieSpacing.xSmall) {
                  ProgressView().tint(JovieColor.textTertiary)
                  Text("Rendering")
                    .font(JovieFont.body(size: 11, weight: .medium))
                    .foregroundStyle(JovieColor.textTertiary)
                }
                .transition(.opacity)
              }
            }
            .animation(JovieMotion.subtle, value: design.isReady)

            Text(design.designName)
              .font(JovieFont.body(size: 14, weight: .semibold))
              .foregroundStyle(JovieColor.textPrimary)
              .lineLimit(1)

            if !design.concept.isEmpty {
              Text(design.concept)
                .font(JovieFont.body(size: 12))
                .foregroundStyle(JovieColor.textSecondary)
                .lineLimit(2)
            }

            merchButton("Use This One") {
              onSelectPrompt(
                "Use design \(design.optionNumber) from generation \(payload.generationId)."
              )
            }
            .disabled(!design.isReady)
          }
        }
      }
    }
  }

  private func merchSection<Content: View>(
    title: String,
    subtitle: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(title)
          .font(JovieFont.body(size: 15, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
        Text(subtitle)
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
          .fixedSize(horizontal: false, vertical: true)
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: JovieSpacing.medium) {
          content()
        }
      }
    }
  }

  private func merchCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      content()
    }
    .frame(width: 168)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityElement(children: .combine)
  }

  private func optionBadge(_ optionNumber: Int) -> some View {
    Text("Option \(optionNumber)")
      .font(JovieFont.body(size: 11, weight: .medium))
      .foregroundStyle(Color.white)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
      .padding(JovieSpacing.small)
  }

  private func merchButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(title, action: action).buttonStyle(MobileChatMerchActionButtonStyle())
  }

  @ViewBuilder
  private func mockupImage(url: URL?, label: String, accent: Color) -> some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(
          LinearGradient(
            colors: [accent.opacity(0.22), JovieColor.surface2],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )

      if let url {
        MobileChatMerchMockupImage(url: url, label: label)
      } else {
        Image(systemName: "tshirt")
          .font(.system(size: 28, weight: .light))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
    .aspectRatio(1, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(JovieColor.borderSubtle, lineWidth: 1)
    }
  }

  private func productSubtitle(_ option: MobileChatMerchOptionCard) -> String {
    if let colorway = option.colorway, !colorway.isEmpty {
      return "\(option.productLabel) · \(colorway)"
    }
    return option.productLabel
  }

  private func merchAccent(for optionNumber: Int) -> Color {
    switch optionNumber % 3 {
    case 1: return JovieColor.EntityAccent.artist
    case 2: return JovieColor.EntityAccent.track
    default: return JovieColor.EntityAccent.release
    }
  }
}

private struct MobileChatMerchMockupImage: View {
  let url: URL
  let label: String

  @State private var image: UIImage?

  init(url: URL, label: String) {
    self.url = url
    self.label = label
    _image = State(initialValue: AvatarImageCache.image(for: url))
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        Color.clear
      }
    }
    .task(id: url) {
      guard image == nil else { return }
      image = await AvatarImageLoader.load(url)
    }
    .accessibilityLabel("\(label) mockup")
  }
}

private struct MobileChatMerchActionButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(JovieFont.body(size: 13, weight: .semibold))
      .foregroundStyle(JovieColor.backgroundBase)
      .frame(maxWidth: .infinity)
      .padding(.vertical, JovieSpacing.small)
      .background(Color.white.opacity(configuration.isPressed ? 0.88 : 1), in: Capsule())
  }
}