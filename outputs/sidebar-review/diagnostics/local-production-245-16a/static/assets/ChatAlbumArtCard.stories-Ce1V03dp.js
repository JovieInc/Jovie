import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{H as n,U as r}from"./removable-_8fTgXVw.js";import{c as i,s as a}from"./iframe-B1b4EUuv.js";import{n as o,t as s}from"./ChatAlbumArtCard-CK3PdjvP.js";import{r as c,t as l}from"./ChatAlbumArtSwipeReview-De7BAgJV.js";function u({children:e}){let t=new a({defaultOptions:{queries:{retry:!1},mutations:{retry:!1}}});return(0,d.jsx)(n,{client:t,children:(0,d.jsx)(`div`,{className:`w-sm max-w-full`,children:e})})}var d,f,p,m,h,g,_,v,y,b,x;function S(){return(S=e((()=>{d=t(),i(),r(),o(),c(),f={success:!0,state:`generated`,releaseId:`release-1`,releaseTitle:`Skyline Dreams`,artistName:`Sasha Waves`,generationId:`gen-1`,hasExistingArtwork:!1,candidates:[{id:`candidate-1`,styleId:`dream-pop`,styleLabel:`Dream Pop`,previewUrl:`https://placehold.co/256x256`,fullResUrl:`https://placehold.co/1024x1024`},{id:`candidate-2`,styleId:`vaporwave`,styleLabel:`Vaporwave`,previewUrl:`https://placehold.co/256x256`,fullResUrl:`https://placehold.co/1024x1024`}]},p={success:!0,state:`needs_release_target`,releaseTitle:null,artistName:`Sasha Waves`,suggestedReleases:[{id:`release-1`,title:`Skyline Dreams`},{id:`release-2`,title:`Neon Tide`}]},m={success:!1,retryable:!0,error:`Album art generation failed. Please try again.`},h={title:`Jovie/ChatAlbumArtCard`,component:s,parameters:{layout:`centered`},args:{profileId:`story-profile`},decorators:[e=>(0,d.jsx)(u,{children:(0,d.jsx)(e,{})})]},g={args:{result:f}},_={args:{result:f},decorators:[e=>(globalThis.localStorage.removeItem(l),(0,d.jsx)(e,{}))]},v={args:{result:f},decorators:[e=>(globalThis.localStorage.setItem(l,`on`),(0,d.jsx)(e,{}))]},y={args:{result:p}},b={args:{result:m}},x=[`GeneratedCandidates`,`SwipeReviewOnboarding`,`SwipeReviewMode`,`NeedsReleaseTarget`,`Failed`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    result: generatedResult
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    result: generatedResult
  },
  decorators: [Story => {
    globalThis.localStorage.removeItem(ALBUM_ART_SWIPE_PREFERENCE_KEY);
    return <Story />;
  }]
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    result: generatedResult
  },
  decorators: [Story => {
    globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'on');
    return <Story />;
  }]
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    result: needsReleaseTargetResult
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    result: failedResult
  }
}`,...b.parameters?.docs?.source}}}})))()}S();export{b as Failed,g as GeneratedCandidates,y as NeedsReleaseTarget,v as SwipeReviewMode,_ as SwipeReviewOnboarding,x as __namedExportsOrder,h as default};