import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./OpportunityInboxFeed-BiPkpLrB.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),a={title:`Dashboard/Opportunity Inbox/Feed`,component:r,parameters:{layout:`fullscreen`}},o={id:`feed-card-1`,sourceKind:`test.suggestion`,signalType:`other`,typeLabel:`Suggestion`,createdAt:`2026-09-01T18:00:00.000Z`,title:`Detroit listeners up 340% — book a show`,why:`Promoter email matched your Detroit growth spike.`,primaryActionLabel:`Approve`,status:`pending`,category:`suggestion`},s={args:{cards:[o],onApprove:()=>{},onDismiss:()=>{},onFeedback:(e,t)=>{},pendingActionId:null,pendingFeedbackId:null,pendingNextStepId:null,enableStackInteractions:!1},render:e=>(0,i.jsx)(`div`,{className:`bg-(--app-shell-content-surface) p-6`,children:(0,i.jsx)(r,{...e})})},c={args:{cards:[o],onApprove:()=>{},onDismiss:()=>{},onFeedback:(e,t)=>{},enableStackInteractions:!0},render:e=>(0,i.jsx)(`div`,{className:`bg-(--app-shell-content-surface) p-6`,children:(0,i.jsx)(r,{...e})})},l={args:{cards:[{...o,id:`yt-feed-1`,sourceKind:`youtube.thumbnail_candidate`,typeLabel:`YouTube Thumbnail`,title:`Review thumbnail for The Last Time`,why:`YouTube API snapshot captured Sep 1, 2026. Approval records intent; publication stays blocked pending a native Studio experiment and provider readback.`,primaryActionLabel:`Approve Candidate`,category:`youtube_thumbnail`,youtubeThumbnail:{channelId:`UC90tJdD38139ytPUdEZVl1A`,youtubeVideoId:`video-1`,currentThumbnailUrl:`https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg`,candidateImageUrl:`https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg`,artifactSha256:`aab81dd7f28d4421478c03e4d0d62a58ef13db556c4c52beacf56f24f782ba01`,apiMetrics:{capturedAt:`2026-09-01T12:00:00.000Z`,views:128450,watchTimeMinutes:438900,avgViewDurationSeconds:205},publicationBlockedReason:`direct-thumbnail-mutation-disabled-native-experiment-required`}}],onApprove:()=>{},onDismiss:()=>{},onFeedback:(e,t)=>{},enableStackInteractions:!1},render:e=>(0,i.jsx)(`div`,{className:`bg-(--app-shell-content-surface) p-6`,children:(0,i.jsx)(r,{...e})})},u={args:{cards:[o],onApprove:()=>{},onDismiss:()=>{},onFeedback:(e,t)=>{},pendingActionId:`feed-card-1`,enableStackInteractions:!0},render:e=>(0,i.jsx)(`div`,{className:`bg-(--app-shell-content-surface) p-6`,children:(0,i.jsx)(r,{...e})})},d=[`Default`,`StackInteractions`,`YoutubeThumbnailCandidate`,`Loading`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    pendingActionId: null,
    pendingFeedbackId: null,
    pendingNextStepId: null,
    enableStackInteractions: false
  },
  render: args => <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    enableStackInteractions: true
  },
  render: args => <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [{
      ...baseCard,
      id: 'yt-feed-1',
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
    }],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    enableStackInteractions: false
  },
  render: args => <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    pendingActionId: 'feed-card-1',
    enableStackInteractions: true
  },
  render: args => <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
}`,...u.parameters?.docs?.source}}}})))()}f();export{s as Default,u as Loading,c as StackInteractions,l as YoutubeThumbnailCandidate,d as __namedExportsOrder,a as default};