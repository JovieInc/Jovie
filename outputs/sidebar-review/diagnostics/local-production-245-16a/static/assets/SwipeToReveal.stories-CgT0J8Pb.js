import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{n as i,r as a,t as o}from"./SwipeToReveal-DfWCvEnF.js";var s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{s=t(),n(),a(),{fn:c}=__STORYBOOK_MODULE_TEST__,l=()=>(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(r,{type:`button`,variant:`ghost`,className:`h-full w-10 rounded-none bg-info text-app text-white`,children:`Edit`}),(0,s.jsx)(r,{type:`button`,variant:`ghost`,className:`h-full w-10 rounded-none bg-error text-app text-white`,children:`Delete`})]}),u=({label:e})=>(0,s.jsx)(`div`,{className:`flex h-14 items-center bg-surface-1 px-4 text-app text-primary-token`,children:e}),d={title:`Atoms/SwipeToReveal`,component:o,parameters:{layout:`centered`,docs:{description:{component:"`SwipeToReveal` only activates its drag gesture on touch devices (or with\n`forceEnabled`). Storybook runs in a pointer-driven browser, so\n`forceEnabled` is used below to render the touch layout for review;\ndragging the row left reveals the action buttons."}}},args:{actionsWidth:80,actions:(0,s.jsx)(l,{}),children:(0,s.jsx)(u,{label:`Spotify`}),onOpen:c(),onClose:c()},decorators:[e=>(0,s.jsx)(`div`,{className:`w-80 overflow-hidden rounded-md border border-subtle`,children:(0,s.jsx)(e,{})})]},f={name:`Non-touch (renders children only)`,args:{forceEnabled:!1}},p={name:`Touch-enabled (drag left to reveal)`,args:{forceEnabled:!0}},m={name:`Grouped (only one open at a time)`,render:e=>(0,s.jsx)(i,{children:(0,s.jsxs)(`div`,{className:`divide-y divide-subtle`,children:[(0,s.jsx)(o,{...e,itemId:`row-1`,children:(0,s.jsx)(u,{label:`Spotify`})}),(0,s.jsx)(o,{...e,itemId:`row-2`,children:(0,s.jsx)(u,{label:`Apple Music`})})]})}),args:{forceEnabled:!0}},h=[`NonTouch`,`TouchEnabled`,`Grouped`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  name: 'Non-touch (renders children only)',
  args: {
    forceEnabled: false
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  name: 'Touch-enabled (drag left to reveal)',
  args: {
    forceEnabled: true
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  name: 'Grouped (only one open at a time)',
  render: args => <SwipeToRevealGroup>
      <div className='divide-y divide-subtle'>
        <SwipeToReveal {...args} itemId='row-1'>
          <Row label='Spotify' />
        </SwipeToReveal>
        <SwipeToReveal {...args} itemId='row-2'>
          <Row label='Apple Music' />
        </SwipeToReveal>
      </div>
    </SwipeToRevealGroup>,
  args: {
    forceEnabled: true
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{m as Grouped,f as NonTouch,p as TouchEnabled,h as __namedExportsOrder,d as default};