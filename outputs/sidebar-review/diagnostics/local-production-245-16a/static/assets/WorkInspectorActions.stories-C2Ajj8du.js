import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./WorkInspectorActions-C-elEFpI.js";var r,i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{t(),r={id:`release-1`,title:`Take Me Over`,artist:`Tim White`,artworkUrl:null,previewUrl:null,videoUrl:null,waveformSeed:17,smartLinkPath:`/tim/take-me-over`,releaseDate:`2026-04-28T00:00:00.000Z`,releaseType:`single`,status:`released`,approvalStatus:`draft`,profileVisibility:`visible`,trackCount:1,providerCount:1,providers:[],hasLyrics:!1,hasArtwork:!0,hasVideoLinks:!1,assetKinds:[],genres:[],spotifyPopularity:null,targetPlaylistCount:0,isExplicit:!1,label:null,upc:null,distributor:null,totalDurationMs:null},i={id:`launch-1`,workId:`release-1`,title:`Take Me Over launch`,kitStatus:`ready`,pressKitHref:`/app/releases/release-1/press-kit`,pressReleaseHref:`/app/releases/release-1/press-release`,launchHref:`/app/releases/release-1/tasks`},a={title:`Library/WorkInspectorActions`,component:n,args:{asset:r,launches:[],canPublish:!0,disabled:!1,onSharePrivately:()=>void 0}},o={},s={args:{asset:{...r,status:`scheduled`,smartLinkPath:``}}},c={args:{asset:{...r,status:`draft`,smartLinkPath:``},canPublish:!1}},l={args:{asset:{...r,profileVisibility:`hidden`}}},u={args:{launches:[i]}},d={args:{launches:[{...i,id:`l-prep`,kitStatus:`preparing`},{...i,id:`l-fail`,kitStatus:`failed`},i],onRetryLaunchKit:()=>void 0}},f=[`LivePublicWork`,`PreparedUnpublished`,`PublishBlockedByPermissions`,`IntentionallyPrivateWork`,`ReadyLaunch`,`LaunchStates`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    asset: {
      ...asset,
      status: 'scheduled',
      smartLinkPath: ''
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    asset: {
      ...asset,
      status: 'draft',
      smartLinkPath: ''
    },
    canPublish: false
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    asset: {
      ...asset,
      profileVisibility: 'hidden'
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    launches: [readyLaunch]
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    launches: [{
      ...readyLaunch,
      id: 'l-prep',
      kitStatus: 'preparing'
    }, {
      ...readyLaunch,
      id: 'l-fail',
      kitStatus: 'failed'
    }, readyLaunch],
    onRetryLaunchKit: () => undefined
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{l as IntentionallyPrivateWork,d as LaunchStates,o as LivePublicWork,s as PreparedUnpublished,c as PublishBlockedByPermissions,u as ReadyLaunch,f as __namedExportsOrder,a as default};