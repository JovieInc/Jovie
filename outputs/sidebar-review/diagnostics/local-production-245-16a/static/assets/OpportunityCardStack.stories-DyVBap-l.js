import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./OpportunityCardStack-DkdUTTji.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o=[{id:`card-1`,signalType:`other`,typeLabel:`Suggestion`,createdAt:`2026-09-01T12:00:00.000Z`,title:`Detroit listeners up 340% — book a show`,why:`Promoter email matched your Detroit growth spike.`,primaryActionLabel:`Review pitch`,status:`pending`,category:`suggestion`},{id:`card-2`,signalType:`new_song`,typeLabel:`New Song`,createdAt:`2026-08-31T10:00:00.000Z`,title:`New single detected`,why:`Spotify catalog signal.`,primaryActionLabel:`Set up release`,status:`pending`,category:`suggestion`}],s={title:`Features/Opportunity Inbox/Card Stack`,component:r,parameters:{layout:`fullscreen`},render:e=>(0,i.jsx)(r,{...e}),decorators:[e=>(0,i.jsx)(`div`,{className:`mx-auto min-h-176 w-full max-w-3xl bg-surface-page p-6`,children:(0,i.jsx)(e,{})})],args:{cards:o,onAccept:a(),onReject:a(),onOpen:a()}},c={},l={args:{pendingActionId:`card-1`}},u={args:{cards:[{...o[0],id:`reply-story`,sourceKind:`social_reply.draft`,signalType:`fan_reply`,typeLabel:`Fan Reply`,title:`Reply to Maya on Instagram`,primaryActionLabel:`Approve Reply`,category:`social_reply`,socialReply:{platform:`Instagram`,authorLabel:`@maya.wav`,typeLabel:`Collab Request`,inboundText:`Would you be down to collab?`,draftedText:`Thanks! Let’s find a time to talk.`,sourceUrl:`https://instagram.com/p/story-fixture`,executionState:`pending`,revisionCount:0}}],onRevise:a()}},d={args:{...u.args,pendingReviseId:`reply-story`}},f={args:{cards:[]}},p=[`Default`,`PendingAction`,`SocialReply`,`PendingRevision`,`Empty`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    pendingActionId: 'card-1'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [{
      ...CARDS[0],
      id: 'reply-story',
      sourceKind: 'social_reply.draft',
      signalType: 'fan_reply',
      typeLabel: 'Fan Reply',
      title: 'Reply to Maya on Instagram',
      primaryActionLabel: 'Approve Reply',
      category: 'social_reply',
      socialReply: {
        platform: 'Instagram',
        authorLabel: '@maya.wav',
        typeLabel: 'Collab Request',
        inboundText: 'Would you be down to collab?',
        draftedText: 'Thanks! Let’s find a time to talk.',
        sourceUrl: 'https://instagram.com/p/story-fixture',
        executionState: 'pending',
        revisionCount: 0
      }
    }],
    onRevise: fn()
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    ...SocialReply.args,
    pendingReviseId: 'reply-story'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    cards: []
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{c as Default,f as Empty,l as PendingAction,d as PendingRevision,u as SocialReply,p as __namedExportsOrder,s as default};