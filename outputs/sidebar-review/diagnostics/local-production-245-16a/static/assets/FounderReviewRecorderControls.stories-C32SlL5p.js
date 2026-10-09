import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import"./iframe-B1b4EUuv.js";import"./system-b-app-0raEe-jZ.js";import{n as r,t as i}from"./FounderReviewRecorderControls-B2C_vBft.js";function a(e){let[t,n]=(0,s.useState)(e.typedText),[r,a]=(0,s.useState)(e.keepAudio),[c,l]=(0,s.useState)(e.allowContentUse),[u,d]=(0,s.useState)(e.sessionActive);return(0,o.jsx)(`div`,{className:`min-h-screen bg-(--app-shell-content-surface) p-4 sm:p-6`,children:(0,o.jsx)(`div`,{className:`w-full max-w-2xl`,children:(0,o.jsx)(i,{...e,typedText:t,keepAudio:r,allowContentUse:c,sessionActive:u,onTypedTextChange:n,onKeepAudioChange:a,onAllowContentUseChange:l,onStart:()=>d(!0),onStop:()=>d(!1)})})})}var o,s,c,l,u,d,f,p,m,h,g,_,v,y;function b(){return(b=e((()=>{o=n(),s=t(),r(),c={title:`Dashboard/Opportunity Inbox/Founder Review Recorder Controls`,component:i,parameters:{layout:`fullscreen`},render:e=>(0,o.jsx)(a,{...e},JSON.stringify(e.target))},l={type:`inbox-card`,id:`card-1`,title:`Refresh a weak YouTube thumbnail`,sourceKind:`youtube.thumbnail_candidate`,category:`suggestion`},u={schemaVersion:1,id:`receipt-1`,sessionId:`session-1`,segmentId:`segment-1`,target:l,decision:`approved`,transcript:`Approve this one — the new thumbnail reads better at feed size.`,typedText:``,transcription:{provider:`none`,status:`unsupported`,errorCode:null},recording:{startedAt:`2026-09-01T18:00:00.000Z`,endedAt:`2026-09-01T18:00:08.000Z`,initiatedBy:`button`,status:`not-captured`,retention:`transcript-only`,durationMs:8e3,byteSize:null,sha256:null,mediaAvailable:!1,mediaPath:null,deletedAt:null},consent:{disclosureVersion:1,contentUse:`not-allowed`,capturedAt:`2026-09-01T18:00:00.000Z`},rationaleExtractionStatus:`not-requested`,actionOutcome:{status:`pending`,updatedAt:`2026-09-01T18:00:08.000Z`,errorCode:null},provenance:{surface:`opportunity-inbox`,sourceBinding:`inbox-card:card-1:youtube.thumbnail_candidate`,founderMaterial:!0},authority:{externalActionAuthorized:!1,exactContent:null,destination:null,requiresExplicitApproval:!0},createdAt:`2026-09-01T18:00:08.000Z`},d={args:{target:l,sessionActive:!1,transcript:``,typedText:``,keepAudio:!1,allowContentUse:!1,saving:!1,error:null,latestReceipt:null,onStart:()=>{},onStop:()=>{},onTypedTextChange:()=>{},onKeepAudioChange:()=>{},onAllowContentUseChange:()=>{},onDeleteAudio:()=>{},onSaveNote:()=>{},onApprove:()=>{},onReject:()=>{}}},f={args:{...d.args,sessionActive:!0,transcript:`Approve this one — the new thumbnail reads better at feed size.`,typedText:`Also pull the old cover art.`,keepAudio:!0}},p={args:{...d.args,sessionActive:!0,saving:!0}},m={args:{...d.args,latestReceipt:u}},h={args:{...d.args,error:`Microphone permission was denied. Typed notes still work.`}},g={args:{...d.args,latestReceipt:{...u,recording:{...u.recording,mediaAvailable:!0}}}},_={args:{...d.args,target:{type:`founder-note`,id:`founder-brain-dump`,title:`Inbox Brain Dump`,sourceKind:`founder.brain_dump`,category:`note`}}},v={..._,parameters:{themes:{themeOverride:`light`}}},y=[`Idle`,`Recording`,`Saving`,`SavedTranscriptOnly`,`ErrorState`,`RetainedAudio`,`BrainDump`,`Light`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    target,
    sessionActive: false,
    transcript: '',
    typedText: '',
    keepAudio: false,
    allowContentUse: false,
    saving: false,
    error: null,
    latestReceipt: null,
    onStart: () => {},
    onStop: () => {},
    onTypedTextChange: () => {},
    onKeepAudioChange: () => {},
    onAllowContentUseChange: () => {},
    onDeleteAudio: () => {},
    onSaveNote: () => {},
    onApprove: () => {},
    onReject: () => {}
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    sessionActive: true,
    transcript: 'Approve this one — the new thumbnail reads better at feed size.',
    typedText: 'Also pull the old cover art.',
    keepAudio: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    sessionActive: true,
    saving: true
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    latestReceipt: receipt
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    error: 'Microphone permission was denied. Typed notes still work.'
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    latestReceipt: {
      ...receipt,
      recording: {
        ...receipt.recording,
        mediaAvailable: true
      }
    }
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    target: {
      type: 'founder-note',
      id: 'founder-brain-dump',
      title: 'Inbox Brain Dump',
      sourceKind: 'founder.brain_dump',
      category: 'note'
    }
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  ...BrainDump,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...v.parameters?.docs?.source}}}})))()}b();export{_ as BrainDump,h as ErrorState,d as Idle,v as Light,f as Recording,g as RetainedAudio,m as SavedTranscriptOnly,p as Saving,y as __namedExportsOrder,c as default};