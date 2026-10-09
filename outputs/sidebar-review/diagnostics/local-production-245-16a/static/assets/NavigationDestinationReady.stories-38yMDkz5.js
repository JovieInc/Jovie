import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./NavigationDestinationReady-DwvGumu0.js";var i,a,o,s,c;function l(){return(l=e((()=>{i=t(),n(),a={title:`Dashboard/NavigationDestinationReady`,component:r,parameters:{layout:`centered`,docs:{description:{component:"NavigationDestinationReady is a headless readiness signal: it renders\nnothing and fires `markNavigationDestinationReady` once `ready` is true.\nThe story exists to satisfy story coverage and to document usage; there\nis no visual output to assert against."}}},args:{destination:`library`,ready:!0}},o={render:e=>(0,i.jsxs)(`div`,{className:`text-sm text-tertiary-token`,children:[`Renders nothing — marks "`,e.destination,`" ready on mount.`,(0,i.jsx)(r,{...e})]})},s={args:{ready:!1},render:e=>(0,i.jsxs)(`div`,{className:`text-sm text-tertiary-token`,children:[`Renders nothing — destination data is still loading, so no readiness signal fires.`,(0,i.jsx)(r,{...e})]})},c=[`Ready`,`NotYetReady`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: args => <div className='text-sm text-tertiary-token'>
      Renders nothing — marks &quot;{args.destination}&quot; ready on mount.
      <NavigationDestinationReady {...args} />
    </div>
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    ready: false
  },
  render: args => <div className='text-sm text-tertiary-token'>
      Renders nothing — destination data is still loading, so no readiness
      signal fires.
      <NavigationDestinationReady {...args} />
    </div>
}`,...s.parameters?.docs?.source}}}})))()}l();export{s as NotYetReady,o as Ready,c as __namedExportsOrder,a as default};