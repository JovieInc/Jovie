import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./Banner-PZ9WjRrY.js";var r,i,a,o,s,c,l,u;function d(){return(d=e((()=>{t(),{fn:r}=__STORYBOOK_MODULE_TEST__,i={title:`Feedback/Banner`,component:n,parameters:{layout:`centered`},args:{title:`Imports are paused`,description:`Jovie will resume sync when Spotify is reachable.`,variant:`info`},argTypes:{variant:{control:`select`,options:[`info`,`success`,`warning`,`error`]}}},a={},o={args:{title:`Import complete`,description:`Your audience links are ready to review.`,variant:`success`}},s={args:{title:`Import is taking longer than expected`,description:`You can keep editing while Jovie keeps checking platforms.`,variant:`warning`}},c={args:{title:`Import failed`,description:`Try again after checking the Spotify artist link.`,variant:`error`}},l={args:{title:`Connection restored`,description:`Review the recovered profile matches.`,variant:`success`,action:{label:`Review`,onClick:r()},onDismiss:r()}},u=[`Info`,`Success`,`Warning`,`Error`,`DismissibleWithAction`],a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Import complete',
    description: 'Your audience links are ready to review.',
    variant: 'success'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Import is taking longer than expected',
    description: 'You can keep editing while Jovie keeps checking platforms.',
    variant: 'warning'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Import failed',
    description: 'Try again after checking the Spotify artist link.',
    variant: 'error'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Connection restored',
    description: 'Review the recovered profile matches.',
    variant: 'success',
    action: {
      label: 'Review',
      onClick: fn()
    },
    onDismiss: fn()
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as DismissibleWithAction,c as Error,a as Info,o as Success,s as Warning,u as __namedExportsOrder,i as default};