import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ErrorDisplay-B-6PtPhs.js";var i,a,o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Jovie/Components/ErrorDisplay`,component:r,parameters:{layout:`centered`,backgrounds:{default:`dark`}},decorators:[e=>(0,i.jsx)(`div`,{className:`w-full max-w-md`,children:(0,i.jsx)(e,{})})],args:{chatError:{type:`server`,message:`The model timed out.`,errorCode:`CHAT_TIMEOUT`,requestId:`req_123`,failedMessage:`Retry this`},onRetry:o(),isLoading:!1,isSubmitting:!1}},u={play:async({args:e,canvasElement:t})=>{let n=c(t);await a(n.getByText(`CHAT_TIMEOUT · req_123`)).toBeInTheDocument(),await s.click(n.getByRole(`button`,{name:`Retry Message`})),await a(e.onRetry).toHaveBeenCalledOnce()}},d={args:{chatError:{type:`network`,message:`You appear to be offline.`,failedMessage:`Check your connection`}}},f={args:{chatError:{type:`tool`,message:`Retouch is not provisioned for this account.`,errorCode:`TOOL_UNPROVISIONED`,suppressComposerPause:!0}}},p={args:{presentation:`operator`,chatError:{type:`server`,message:`We encountered a temporary issue. Please try again.`,failedMessage:`What matters now?`}}},m={args:{isLoading:!0},play:async({canvasElement:e})=>{let t=c(e);await a(t.getByRole(`button`,{name:`Retry Message`})).toBeDisabled()}},h=[`MessagePaused`,`NetworkOffline`,`ToolScopedFailure`,`OperatorPresentation`,`Retrying`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('CHAT_TIMEOUT · req_123')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', {
      name: 'Retry Message'
    }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    chatError: {
      type: 'network',
      message: 'You appear to be offline.',
      failedMessage: 'Check your connection'
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    chatError: {
      type: 'tool',
      message: 'Retouch is not provisioned for this account.',
      errorCode: 'TOOL_UNPROVISIONED',
      suppressComposerPause: true
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    presentation: 'operator',
    chatError: {
      type: 'server',
      message: 'We encountered a temporary issue. Please try again.',
      failedMessage: 'What matters now?'
    }
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    isLoading: true
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', {
      name: 'Retry Message'
    })).toBeDisabled();
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{u as MessagePaused,d as NetworkOffline,p as OperatorPresentation,m as Retrying,f as ToolScopedFailure,h as __namedExportsOrder,l as default};