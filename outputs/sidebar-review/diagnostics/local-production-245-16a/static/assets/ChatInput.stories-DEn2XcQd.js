import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import"./system-b-app-0raEe-jZ.js";import{n as r,t as i}from"./ChatEmptyStateGreeting-C6MYvQ71.js";import{n as a,t as o}from"./ChatInput-DlCeeZXi.js";import{n as s,t as c}from"./ChatEmptyStateComposerRegion-CiCJeO1S.js";import{n as l,t as u}from"./ChatEmptyStateOpportunityCards-DhZVZOS3.js";function d(e){let[t,n]=(0,m.useState)(e.value);(0,m.useEffect)(()=>{n(e.value)},[e.value]);let r=t=>{n(t),e.onChange(t)};return(0,p.jsx)(`div`,{className:`w-[min(44rem,calc(100vw-2rem))]`,children:(0,p.jsx)(o,{...e,value:t,onChange:r})})}function f({args:e,centered:t=!1}){let[n,r]=(0,m.useState)(!1),[a,s]=(0,m.useState)(e.value);return(0,m.useEffect)(()=>{let e=Object.getOwnPropertyDescriptor(window,`electronAPI`);return Object.defineProperty(window,"electronAPI",{configurable:!0,value:{platform:`darwin`,getDictationStatus:async()=>({ok:!0,nativeAvailable:!1,webSpeechFallbackAllowed:!1,mode:`unavailable`,reason:`storybook-system-dictation-guidance`})}}),r(!0),()=>{e?Object.defineProperty(window,"electronAPI",e):Reflect.deleteProperty(window,`electronAPI`)}},[]),n?(0,p.jsx)(`div`,{className:`h-screen p-4`,children:(0,p.jsx)(c,{stableDocked:!t,onSelectSample:h(),above:t?void 0:(0,p.jsxs)(`div`,{className:`space-y-4`,children:[(0,p.jsx)(i,{firstName:`Tim`,insight:null}),(0,p.jsx)(u,{cards:[{id:`release-checklist`,signalType:`other`,typeLabel:`Suggestion`,title:`Review your release checklist`,why:`Check artwork, credits and links before the release.`,createdAt:`2026-01-15T12:00:00.000Z`,primaryActionLabel:`Review`,status:`pending`,category:`suggestion`}],onSelect:e=>s(e.title)})]}),children:(0,p.jsx)(o,{...e,value:a,onChange:s})})}):null}var p,m,h,g,_,v,y,b,x,S,C,w,T;function E(){return(E=e((()=>{p=n(),m=t(),s(),r(),l(),a(),{fn:h}=__STORYBOOK_MODULE_TEST__,g={title:`Jovie/Components/ChatInput`,component:o,parameters:{layout:`centered`,backgrounds:{default:`dark`},jovie:{uncoveredProps:`mention.containerRef.hiddenDivRef.internalTextareaRef.micButtonRef.handleKeyDown.isAtMaxHeight.measuredHeight.reducedMotion.isNearLimit.hasAttachButton.plusMenuOpen.setPlusMenuOpen.handlePreserveFocus.event.isDictationSupported.isListening.dictationUnavailableHint.handleMicUnavailable.handleMicPushStart.handleMicPushEnd.handleMicToggle.canSend.canInterruptAndSend.onSend.setIsFocused.setComposerFocused.isPickerOpen.isRootPickerOpen.pickerListId.pickerActiveRowId.isHero`.split(`.`)}},args:{value:``,onChange:h(),onSubmit:h(),onInterruptAndSend:h(),isLoading:!1,isSubmitting:!1,placeholder:`Ask Jovie anything...`,variant:`hero`,onFileAttach:h(),onAudioAttach:h(),isFileProcessing:!1,onPaste:h(),onPickerOpenChange:h(),dictationEnabled:!1},render:e=>(0,p.jsx)(d,{...e})},_={},v={args:{value:`Draft a concise release announcement for Friday.`,variant:`default`}},y={args:{value:`Use the attached cover art for the campaign.`,isFileProcessing:!0,variant:`default`}},b={args:{value:`Tighten the opening paragraph.`,isLoading:!0,isStreaming:!0,onStop:h(),variant:`compact`}},x={parameters:{layout:`fullscreen`},args:{dictationEnabled:!0},decorators:[e=>(0,p.jsx)(`div`,{className:`flex h-screen items-end justify-center p-6`,children:(0,p.jsx)(e,{})})]},S={parameters:{layout:`fullscreen`},args:{dictationEnabled:!0},render:e=>(0,p.jsx)(f,{args:e})},C={parameters:{layout:`fullscreen`},args:{dictationEnabled:!0},render:e=>(0,p.jsx)(f,{args:e,centered:!0})},w={...S,parameters:{layout:`fullscreen`,themes:{themeOverride:`light`}}},T=[`Empty`,`Drafting`,`ProcessingFile`,`Streaming`,`Docked`,`DesktopGuidanceDocked`,`DesktopGuidanceCentered`,`DesktopGuidanceLight`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'Draft a concise release announcement for Friday.',
    variant: 'default'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'Use the attached cover art for the campaign.',
    isFileProcessing: true,
    variant: 'default'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'Tighten the opening paragraph.',
    isLoading: true,
    isStreaming: true,
    onStop: fn(),
    variant: 'compact'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'fullscreen'
  },
  args: {
    dictationEnabled: true
  },
  decorators: [Story => <div className='flex h-screen items-end justify-center p-6'>
        <Story />
      </div>]
}`,...x.parameters?.docs?.source},description:{story:`Docked fixture for palette and recoverable microphone-error geometry.`,...x.parameters?.docs?.description}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'fullscreen'
  },
  args: {
    dictationEnabled: true
  },
  render: args => <DesktopGuidanceFixture args={args} />
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'fullscreen'
  },
  args: {
    dictationEnabled: true
  },
  render: args => <DesktopGuidanceFixture args={args} centered />
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  ...DesktopGuidanceDocked,
  parameters: {
    layout: 'fullscreen',
    themes: {
      themeOverride: 'light'
    }
  }
}`,...w.parameters?.docs?.source}}}})))()}E();export{C as DesktopGuidanceCentered,S as DesktopGuidanceDocked,w as DesktopGuidanceLight,x as Docked,v as Drafting,_ as Empty,y as ProcessingFile,b as Streaming,T as __namedExportsOrder,g as default};