import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{i as t,n}from"./ChatComposerToolbar-BfM2uS5Y.js";var r,i,a,o,s,c;function l(){return(l=e((()=>{t(),{fn:r}=__STORYBOOK_MODULE_TEST__,i={title:`Jovie/Components/ChatComposerToolbar`,component:n,parameters:{layout:`centered`,backgrounds:{default:`dark`},jovie:{uncoveredProps:[`event`,`canSend`,`isStreaming`,`reducedMotion`,`onMouseDown`,`isFileProcessing`,`plusMenuOpen`,`onOpenChange`,`disabled`]}}},a={args:{isListening:!1,isSupported:!0,unavailableHint:null,onPreserveFocus:r(),onPushStart:r(),onPushEnd:r(),onToggle:r()}},o={args:{...a.args,isListening:!0}},s={args:{...a.args,isSupported:!1,unavailableHint:`Use macOS dictation (press Fn twice) inside the desktop app.`,onUnavailable:r()}},c=[`Idle`,`Listening`,`UnsupportedWithSystemDictationHint`],a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    isListening: false,
    isSupported: true,
    unavailableHint: null,
    onPreserveFocus: fn(),
    onPushStart: fn(),
    onPushEnd: fn(),
    onToggle: fn()
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    isListening: true
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    ...Idle.args,
    isSupported: false,
    unavailableHint: 'Use macOS dictation (press Fn twice) inside the desktop app.',
    onUnavailable: fn()
  }
}`,...s.parameters?.docs?.source}}}})))()}l();export{a as Idle,o as Listening,s as UnsupportedWithSystemDictationHint,c as __namedExportsOrder,i as default};