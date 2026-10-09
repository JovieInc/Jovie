import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{i as r,n as i,r as a,t as o}from"./LibrarySurface-DXckc5FI.js";import{r as s,t as c}from"./button-BSHhPV4e.js";import{n as l,r as u,t as d}from"./RightPanelContext-YZbrsGtE.js";import"./system-b-app-0raEe-jZ.js";function f(){let e=u();return(0,m.jsx)(`aside`,{className:`w-90 shrink-0 border-l border-(--app-shell-border)`,children:e})}function p({rowCount:e=1,width:t,loading:n=!1}){let[r,i]=(0,h.useState)(0),s=Array.from({length:e},(e,t)=>({...v,id:t===0?v.id:`${v.id}-${t}`,title:t===0?v.title:`Work ${t}: ${v.title}`,artist:`An artist name long enough to exercise narrow table disclosure`,artworkUrl:t%2?`/brand/Jovie-Logo-Icon.svg`:null}));return(0,m.jsxs)(d,{children:[(0,m.jsx)(c,{onClick:()=>i(r+1),children:`Refresh Fixture`}),(0,m.jsxs)(`div`,{"data-testid":`library-browser-proof`,"data-revision":r,className:`flex h-screen bg-(--app-shell-content-surface)`,style:{width:t},children:[(0,m.jsx)(`main`,{className:`min-w-0 flex-1 overflow-hidden`,children:n?(0,m.jsx)(a,{}):(0,m.jsx)(o,{assets:s,postReleaseBundle:y})}),(0,m.jsx)(f,{})]})]})}var m,h,g,_,v,y,b,x,S,C,w,T,E,D;function O(){return(O=e((()=>{m=n(),s(),h=t(),r(),i(),l(),{userEvent:g,within:_}=__STORYBOOK_MODULE_TEST__,v={id:`release-proof`,title:`A Deliberately Long Work Title That Still Identifies the Selection`,artist:`Tim White`,artworkUrl:null,previewUrl:null,videoUrl:null,waveformSeed:27,smartLinkPath:`/tim/work-inspector-proof`,releaseDate:`2026-10-02T00:00:00.000Z`,releaseType:`single`,status:`released`,approvalStatus:`approved`,profileVisibility:`hidden`,lifecycleStatus:`active`,trackCount:1,providerCount:2,providers:[{key:`spotify`,label:`Spotify`,url:`https://open.spotify.com/album/work-inspector-proof`},{key:`appleMusic`,label:`Apple Music`,url:`https://music.apple.com/album/work-inspector-proof`}],hasLyrics:!1,hasArtwork:!1,hasVideoLinks:!1,assetKinds:[`providers`],genres:[`Electronic`],spotifyPopularity:null,targetPlaylistCount:0,isExplicit:!1,label:`Independent`,upc:`123456789012`,primaryIsrc:`USAAA2600001`,distributor:null,totalDurationMs:193e3,description:`A compact inspector proof with missing artwork and independent public states.`,share:{assetId:`release-proof`,visibility:`public`,shareSlug:`work-inspector-proof`,accessToken:`storybook-proof-token`,shareUrl:`https://jov.ie/tim/work-inspector-proof`,tokenRevokedAt:null},source:{provider:`discography`,canonicalId:`catalog-release-proof`}},y={downloads:[{id:`download-proof`,releaseId:v.id,title:`Master WAV`,fileName:`master.wav`}],findings:[],rightsholders:[{id:`rightsholder-proof`,subjectType:`release`,subjectId:v.id,partyName:`Tim White`,role:`writer`,domain:`composition`,evidenceClass:`observed`,source:`songview`,sourceWorkId:`ASCAP-123456`,sourceUrl:`https://www.songview.com/`,shareBps:null}],stats:[]},b=async e=>{let t=_(e);await g.click(await t.findByTestId(`library-catalog-row-${v.id}`))},x={title:`Library/WorkInspector`,component:p,parameters:{layout:`fullscreen`,chromatic:{viewports:[390,1440]}}},S={play:async({canvasElement:e})=>{await b(e)}},C={play:async({canvasElement:e})=>{await b(e),await g.click(await _(e).findByRole(`tab`,{name:`Files`}))}},w={args:{rowCount:19,width:892},play:async({canvasElement:e})=>{await b(e)}},T={args:{rowCount:20,width:892},play:async({canvasElement:e})=>{await b(e)}},E={args:{width:892,loading:!0}},D=[`Overview`,`Files`,`DenseScanWithInspector`,`VirtualizedDenseScan`,`DenseLoading`],S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await openInspector(canvasElement);
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await openInspector(canvasElement);
    await userEvent.click(await within(canvasElement).findByRole('tab', {
      name: 'Files'
    }));
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    rowCount: 19,
    width: 892
  },
  play: async ({
    canvasElement
  }) => {
    await openInspector(canvasElement);
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    rowCount: 20,
    width: 892
  },
  play: async ({
    canvasElement
  }) => {
    await openInspector(canvasElement);
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    width: 892,
    loading: true
  }
}`,...E.parameters?.docs?.source}}}})))()}O();export{E as DenseLoading,w as DenseScanWithInspector,C as Files,S as Overview,T as VirtualizedDenseScan,D as __namedExportsOrder,x as default};