import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,r}from"./demo-personas-B48xs9UB.js";import{n as i,t as a}from"./ReleaseLandingPage-DYBtR_Sq.js";import{i as o,n as s,s as c}from"./mock-release-data-Dr3bReru.js";import{n as l,t as u}from"./DemoClientProviders-W2IdV28E.js";var d,f,p,m,h,g,_;function v(){return(v=e((()=>{d=t(),i(),l(),c(),n(),f=o[0],p=r.profile,m={release:{title:f.title,artworkUrl:f.artworkUrl??null,releaseDate:f.releaseDate??null},artist:{name:p.displayName,handle:p.handle,avatarUrl:p.avatarSrc},providers:f.providers.map(e=>({key:e.key,label:e.label,accent:s[e.key].accent,url:e.url})),tracking:{contentType:`release`,contentId:f.id,smartLinkSlug:f.slug},utmParams:{utm_source:`jovie`}},h={title:`Public/Routes/ReleaseSmartLink`,component:a,decorators:[e=>(0,d.jsx)(u,{children:(0,d.jsx)(e,{})})],parameters:{layout:`fullscreen`,docs:{description:{component:`Deterministic source-backed presentation for the legacy web-196-r--[slug] fallback. The story mounts the exact ReleaseLandingPage body with the checked-in internal demo persona and release. Database lookup, canonical redirects, provider redirects, metadata, and deployed release data remain route-owned.`}},pen:{registryId:`web-196-r--[slug]`,route:`/r/[slug]`,source:`apps/web/app/r/[slug]/ReleaseLandingPage.tsx`,sourceExport:`ReleaseLandingPage`,storyExport:`Web196LegacyFallback`,sourceSha:`00895196e53b823bb0311193b4af29f67b8849c1`,fixture:`INTERNAL_DJ_DEMO_PERSONA + DEMO_RELEASE_VIEW_MODELS[0]`,proofTier:`source-backed`}},tags:[`autodocs`],args:m},g={name:`web-196 /r/[slug] — legacy fallback`},_=[`WEB196_RELEASE_ARGS`,`Web196LegacyFallback`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  release: {
    title: RELEASE.title,
    artworkUrl: RELEASE.artworkUrl ?? null,
    releaseDate: RELEASE.releaseDate ?? null
  },
  artist: {
    name: ARTIST.displayName,
    handle: ARTIST.handle,
    avatarUrl: ARTIST.avatarSrc
  },
  providers: RELEASE.providers.map(provider => ({
    key: provider.key,
    label: provider.label,
    accent: DEMO_PROVIDER_CONFIG[provider.key].accent,
    url: provider.url
  })),
  tracking: {
    contentType: 'release',
    contentId: RELEASE.id,
    smartLinkSlug: RELEASE.slug
  },
  utmParams: {
    utm_source: 'jovie'
  }
} satisfies ComponentProps<typeof ReleaseLandingPage>`,...m.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  name: 'web-196 /r/[slug] — legacy fallback'
}`,...g.parameters?.docs?.source}}}})))()}v();export{m as WEB196_RELEASE_ARGS,g as Web196LegacyFallback,_ as __namedExportsOrder,h as default};