import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./image-rAVYTnVY.js";import{r as a,t as o}from"./button-BSHhPV4e.js";import{n as s,t as c}from"./image-CenGJ5UI.js";import{n as l,t as u}from"./FounderReviewRecorder-XqkoBqfp.js";import{n as d,t as f}from"./OpportunityInboxYoutubeThumbnailCard-D8bZHEdr.js";function p({cards:e,onApprove:t,onReject:n,onOpen:r,pendingActionId:a=null,keyboardControlRef:c}){let l=e[0]??null,d=(0,h.useRef)(null),p=l?.category===`youtube_thumbnail`&&!!l.youtubeThumbnail,g=(0,h.useCallback)(e=>{if(!(!l||e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey||e.repeat||e.target!==e.currentTarget)){if(e.key===`ArrowRight`){if(e.preventDefault(),p){t(l.id);return}d.current?.approve()}else if(e.key===`ArrowLeft`){if(e.preventDefault(),p){n(l.id);return}d.current?.reject()}}},[l,p,t,n]);return l?(0,m.jsxs)(`section`,{"aria-label":`Founder Opportunity Review`,"data-testid":`founder-review-stack`,children:[(0,m.jsx)(o,{type:`button`,ref:c,variant:`ghost`,size:`sm`,className:`sr-only focus-visible:absolute focus-visible:top-0 focus-visible:left-0 focus-visible:z-20 focus-visible:not-sr-only`,onClick:()=>r?.(l.id),onKeyDown:g,children:`Review Current Opportunity`}),(0,m.jsxs)(`div`,{className:`mb-3 flex items-center justify-between gap-3 text-xs text-tertiary-token`,children:[(0,m.jsx)(`span`,{children:`Founder Queue`}),(0,m.jsxs)(`span`,{"aria-live":`polite`,children:[`1 of `,e.length]})]}),p&&l.youtubeThumbnail?(0,m.jsx)(f,{card:l,onApprove:t,onReject:n,isBusy:a===l.id}):(0,m.jsxs)(`article`,{className:`overflow-hidden rounded-lg border border-subtle bg-surface-0 shadow-sm`,"data-testid":`founder-review-card-${l.id}`,"aria-busy":a===l.id,children:[(0,m.jsx)(`div`,{className:`relative flex aspect-2/1 min-h-52 items-center justify-center overflow-hidden border-b border-subtle bg-surface-1`,children:l.visual?(0,m.jsx)(s,{src:l.visual.url,alt:l.visual.alt,fill:!0,unoptimized:!0,sizes:`(max-width: 768px) 100vw, 720px`,className:`object-contain`}):(0,m.jsxs)(`div`,{className:`flex max-w-xs flex-col items-center gap-3 px-6 text-center text-tertiary-token`,children:[(0,m.jsx)(i,{"aria-hidden":`true`,className:`size-8 stroke-1`}),(0,m.jsx)(`span`,{className:`text-xs`,children:`Source visual not available`})]})}),(0,m.jsxs)(`div`,{className:`p-5 sm:p-6`,children:[(0,m.jsxs)(`div`,{className:`flex min-h-5 items-center justify-between gap-3 text-2xs font-medium text-tertiary-token`,children:[(0,m.jsx)(`span`,{children:l.typeLabel}),(0,m.jsx)(`span`,{children:l.sourceKind.replaceAll(/[._]/g,` `)})]}),(0,m.jsx)(`h2`,{className:`mt-2 truncate text-xl font-semibold tracking-tight text-primary-token sm:text-2xl`,children:l.title}),(0,m.jsx)(`p`,{className:`mt-2 line-clamp-3 min-h-18 text-sm leading-6 text-secondary-token`,children:l.why}),(0,m.jsx)(u,{ref:d,target:{type:`inbox-card`,id:l.id,title:l.title,sourceKind:l.sourceKind,category:l.category},onApprove:()=>t(l.id),onReject:()=>n(l.id)})]})]})]}):null}var m,h;function g(){return(g=e((()=>{m=n(),a(),r(),c(),h=t(),l(),d()})))()}var _,v,y,b,x,S,C,w;function T(){return(T=e((()=>{g(),_={title:`Dashboard/Opportunity Inbox/Founder Review Stack`,component:p,parameters:{layout:`fullscreen`}},v={id:`opportunity-1`,sourceKind:`test.suggestion`,signalType:`other`,typeLabel:`Suggestion`,createdAt:`2026-09-01T18:00:00.000Z`,title:`Detroit listeners up 340% — book a show`,why:`Promoter email matched your Detroit growth spike.`,primaryActionLabel:`Approve`,status:`pending`,category:`suggestion`},y={...v,visual:{url:`https://picsum.photos/seed/founder-review-stack/1280/640`,alt:`Opportunity source visual`,fit:`contain`}},b={args:{cards:[y],onApprove:()=>{},onReject:()=>{},onOpen:()=>{},pendingActionId:null,keyboardControlRef:{current:null}}},x={args:{cards:[y],onApprove:()=>{},onReject:()=>{},pendingActionId:`opportunity-1`,keyboardControlRef:{current:null}}},S={args:{cards:[{...v}],onApprove:()=>{},onReject:()=>{},keyboardControlRef:{current:null}}},C={args:{cards:[{...v,id:`yt-opportunity-1`,sourceKind:`youtube.thumbnail_candidate`,typeLabel:`YouTube Thumbnail`,title:`Review thumbnail for The Last Time`,why:`YouTube API snapshot captured Sep 1, 2026. Approval records intent; publication stays blocked pending a native Studio experiment and provider readback.`,primaryActionLabel:`Approve Candidate`,category:`youtube_thumbnail`,youtubeThumbnail:{channelId:`UC90tJdD38139ytPUdEZVl1A`,youtubeVideoId:`video-1`,currentThumbnailUrl:`https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg`,candidateImageUrl:`https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg`,artifactSha256:`aab81dd7f28d4421478c03e4d0d62a58ef13db556c4c52beacf56f24f782ba01`,apiMetrics:{capturedAt:`2026-09-01T12:00:00.000Z`,views:128450,watchTimeMinutes:438900,avgViewDurationSeconds:205},publicationBlockedReason:`direct-thumbnail-mutation-disabled-native-experiment-required`}}],onApprove:()=>{},onReject:()=>{},keyboardControlRef:{current:null}}},w=[`Default`,`PendingApproval`,`NoVisual`,`YoutubeThumbnailCandidate`],b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [stackCard],
    onApprove: () => {},
    onReject: () => {},
    onOpen: () => {},
    pendingActionId: null,
    keyboardControlRef: {
      current: null
    }
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [stackCard],
    onApprove: () => {},
    onReject: () => {},
    pendingActionId: 'opportunity-1',
    keyboardControlRef: {
      current: null
    }
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [{
      ...baseCard
    } as OpportunityInboxCardViewModel & {
      readonly sourceKind: string;
    }],
    onApprove: () => {},
    onReject: () => {},
    keyboardControlRef: {
      current: null
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [{
      ...baseCard,
      id: 'yt-opportunity-1',
      sourceKind: 'youtube.thumbnail_candidate',
      typeLabel: 'YouTube Thumbnail',
      title: 'Review thumbnail for The Last Time',
      why: 'YouTube API snapshot captured Sep 1, 2026. Approval records intent; publication stays blocked pending a native Studio experiment and provider readback.',
      primaryActionLabel: 'Approve Candidate',
      category: 'youtube_thumbnail',
      youtubeThumbnail: {
        channelId: 'UC90tJdD38139ytPUdEZVl1A',
        youtubeVideoId: 'video-1',
        currentThumbnailUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg',
        candidateImageUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        artifactSha256: 'aab81dd7f28d4421478c03e4d0d62a58ef13db556c4c52beacf56f24f782ba01',
        apiMetrics: {
          capturedAt: '2026-09-01T12:00:00.000Z',
          views: 128_450,
          watchTimeMinutes: 438_900,
          avgViewDurationSeconds: 205
        },
        publicationBlockedReason: 'direct-thumbnail-mutation-disabled-native-experiment-required'
      }
    } as OpportunityInboxCardViewModel & {
      readonly sourceKind: string;
    }],
    onApprove: () => {},
    onReject: () => {},
    keyboardControlRef: {
      current: null
    }
  }
}`,...C.parameters?.docs?.source}}}})))()}T();export{b as Default,S as NoVisual,x as PendingApproval,C as YoutubeThumbnailCandidate,w as __namedExportsOrder,_ as default};