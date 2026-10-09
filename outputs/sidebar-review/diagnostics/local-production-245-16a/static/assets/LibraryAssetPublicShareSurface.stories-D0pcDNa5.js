import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./LibraryAssetShareSurface-DX3HYf7A.js";import{i as r,n as i}from"./demo-personas-B48xs9UB.js";var a,o,s,c,l,u;function d(){return(d=e((()=>{r(),t(),a=i.releases[0],o=i.profile,s={assetId:a.id,itemKind:`release`,title:a.title,artistName:o.displayName,artistHandle:o.handle,artworkUrl:a.artworkUrl,previewUrl:null,smartLinkPath:`/${o.handle}/${a.slug}`,visibility:`public`},c={title:`Public/Routes/LibraryAssetPublicShare`,component:n,parameters:{layout:`fullscreen`,docs:{description:{component:`Deterministic source-backed public state for web-058-a--[handle]--[slug]. It reuses the exact LibraryAssetShareSurface and the same checked-in founder release fixture as the private-share contract. Slug lookup, unpublished alerts, metadata, notFound, and deployed asset data remain route-owned.`}},pen:{registryId:`web-058-a--[handle]--[slug]`,route:`/a/timwhite/the-deep-end`,source:`apps/web/components/features/library-asset-share/LibraryAssetShareSurface.tsx`,sourceExport:`LibraryAssetShareSurface`,storyExport:`Web058PublicRelease`,sourceSha:`00895196e53b823bb0311193b4af29f67b8849c1`,fixture:`FOUNDER_DEMO_PERSONA.releases[0]`,proofTier:`source-backed`}},tags:[`autodocs`],args:{view:s}},l={name:`web-058 /a/timwhite/the-deep-end`},u=[`WEB058_PUBLIC_ASSET_VIEW`,`Web058PublicRelease`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  assetId: RELEASE.id,
  itemKind: 'release',
  title: RELEASE.title,
  artistName: ARTIST.displayName,
  artistHandle: ARTIST.handle,
  artworkUrl: RELEASE.artworkUrl,
  previewUrl: null,
  smartLinkPath: \`/\${ARTIST.handle}/\${RELEASE.slug}\`,
  visibility: 'public'
} satisfies LibraryAssetSharePublicView`,...s.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  name: 'web-058 /a/timwhite/the-deep-end'
}`,...l.parameters?.docs?.source}}}})))()}d();export{s as WEB058_PUBLIC_ASSET_VIEW,l as Web058PublicRelease,u as __namedExportsOrder,c as default};