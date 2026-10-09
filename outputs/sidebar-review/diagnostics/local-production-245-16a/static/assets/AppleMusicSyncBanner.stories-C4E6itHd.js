import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{i as t,r as n}from"./dashboard-fixtures-Dl8rldOO.js";import{r,t as i}from"./AppleMusicSyncBanner-C0dQY3Vr.js";var a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{n(),r(),a=[{profileId:`story-profile`,id:`release-1`,title:`Skyline Dreams`,slug:`skyline-dreams`,status:`released`,releaseType:`single`,isExplicit:!1,releaseDate:`2026-01-01`,totalTracks:1,providers:[],spotifyPopularity:null,smartLinkPath:`/smart/release-1`,previewUrl:null,primaryIsrc:null,upc:null}],o={id:`match-1`,providerId:`apple_music`,externalArtistId:`apple-artist-1`,externalArtistName:`Sasha Waves`,externalArtistUrl:`https://music.apple.com/artist/sasha-waves`,externalArtistImageUrl:null,confidenceScore:.92,confidenceBreakdown:{isrcMatchScore:.95,upcMatchScore:.9,nameSimilarityScore:.98,followerRatioScore:.8,genreOverlapScore:.85},matchingIsrcCount:12,matchingUpcCount:2,totalTracksChecked:14,status:`suggested`,createdAt:`2026-09-01T00:00:00.000Z`,updatedAt:`2026-09-01T00:00:00.000Z`},s={title:`Dashboard/Organisms/ReleaseProviderMatrix/AppleMusicSyncBanner`,component:i,parameters:{layout:`padded`,docs:{description:{component:"Passing both `matches` and `isLoading` explicitly (even `isLoading:\nfalse`) disables the component's internal `useDspMatchesQuery` call\n(`providedIsLoading === undefined` gates it), so these stories never hit\nthe network — no query-client seeding required beyond the provider shell\nthe confirm/reject mutations need."}}},decorators:[t],args:{profileId:`story-profile`,spotifyConnected:!0,releases:a,isLoading:!1}},c={args:{matches:[o]}},l={args:{matches:[]}},u={args:{matches:[o],compact:!0}},d={args:{matches:[],compact:!0}},f=[`SuggestedMatch`,`NoMatch`,`CompactSuggested`,`CompactNoMatch`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    matches: [suggestedMatch]
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    matches: []
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    matches: [suggestedMatch],
    compact: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    matches: [],
    compact: true
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as CompactNoMatch,u as CompactSuggested,l as NoMatch,c as SuggestedMatch,f as __namedExportsOrder,s as default};