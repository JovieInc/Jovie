import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./OpportunityInboxSocialReplyCard-C3YkkQ19.js";var i,a,o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={platform:`Instagram`,authorLabel:`@maya.wav`,typeLabel:`Collab Request`,inboundText:`Loved the new track — would you be down to collab on a remix?`,draftedText:`Thank you so much! I love what you did on "Ghostline" — dropping you a DM about collab windows this month.`,sourceUrl:`https://instagram.com/p/abc123`,executionState:`pending`,revisionCount:0},s={id:`reply-1`,sourceKind:`social_reply.draft`,signalType:`fan_reply`,typeLabel:`Fan Reply`,createdAt:`2026-09-30T10:00:00.000Z`,title:`Reply to Maya on Instagram`,why:`Inbound collab request drafted from your saved tone profile. Nothing sends until you approve.`,primaryActionLabel:`Approve Reply`,status:`pending`,category:`social_reply`,socialReply:o},c={title:`Features/Opportunity Inbox/Social Reply Review`,component:r,parameters:{layout:`fullscreen`},render:e=>(0,i.jsx)(r,{...e}),decorators:[e=>(0,i.jsx)(`div`,{className:`mx-auto min-h-176 w-full max-w-3xl bg-surface-page p-6`,children:(0,i.jsx)(e,{})})],args:{card:s,onApprove:a(),onDismiss:a(),onRevise:a()}},l={},u={args:{card:{...s,socialReply:{...o,executionState:`checking`,revisionCount:1,draftedText:`That means a lot — your "Ghostline" remix was incredible. Sending you a DM with open dates.`}}}},d={args:{card:{...s,socialReply:{...o,executionState:`ambiguous`}}}},f={args:{isApproving:!0}},p={args:{card:{...s,id:`reply-yt-1`,title:`Reply to Jordan on YouTube`,socialReply:{...o,platform:`YouTube`,authorLabel:`@jordan.beats`,typeLabel:`Fan Comment`,inboundText:`This drop goes crazy — the bridge at 2:14 is unreal.`,draftedText:`Appreciate you Jordan — that bridge took forever to get right. More coming soon.`,sourceUrl:`https://youtube.com/watch?v=abc123`,videoTitle:`Midnight Run (Official Video)`,likeCount:42}}}},m=[`Review`,`Revised`,`NeedsReview`,`Approving`,`YouTubeComment`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    card: {
      ...card,
      socialReply: {
        ...socialReply,
        executionState: 'checking',
        revisionCount: 1,
        draftedText: 'That means a lot — your "Ghostline" remix was incredible. Sending you a DM with open dates.'
      }
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    card: {
      ...card,
      socialReply: {
        ...socialReply,
        executionState: 'ambiguous'
      }
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    isApproving: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    card: {
      ...card,
      id: 'reply-yt-1',
      title: 'Reply to Jordan on YouTube',
      socialReply: {
        ...socialReply,
        platform: 'YouTube',
        authorLabel: '@jordan.beats',
        typeLabel: 'Fan Comment',
        inboundText: 'This drop goes crazy — the bridge at 2:14 is unreal.',
        draftedText: 'Appreciate you Jordan — that bridge took forever to get right. More coming soon.',
        sourceUrl: 'https://youtube.com/watch?v=abc123',
        videoTitle: 'Midnight Run (Official Video)',
        likeCount: 42
      }
    }
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{f as Approving,d as NeedsReview,l as Review,u as Revised,p as YouTubeComment,m as __namedExportsOrder,c as default};