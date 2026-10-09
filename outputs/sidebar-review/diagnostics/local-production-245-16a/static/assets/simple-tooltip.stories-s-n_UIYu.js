import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{n as i,t as a}from"./simple-tooltip-DjmLZRou.js";var o,s,c,l,u,d;function f(){return(f=e((()=>{o=t(),n(),i(),s={title:`UI/Atoms/SimpleTooltip`,component:a,parameters:{layout:`centered`},tags:[`autodocs`]},c={render:()=>(0,o.jsx)(a,{content:`Save changes`,contentVariant:`compact`,children:(0,o.jsx)(r,{variant:`secondary`,children:`Hover me`})})},l={render:()=>(0,o.jsxs)(`div`,{className:`flex items-center gap-6`,children:[(0,o.jsx)(a,{content:`Copy link`,contentVariant:`compact`,defaultOpen:!0,children:(0,o.jsx)(r,{variant:`secondary`,children:`Compact label`})}),(0,o.jsx)(a,{content:`Copies the public profile URL so you can share it anywhere.`,contentVariant:`rich`,defaultOpen:!0,side:`bottom`,showArrow:!0,children:(0,o.jsx)(r,{variant:`secondary`,children:`Rich explanation`})})]})},u={render:()=>(0,o.jsx)(a,{content:`A longer tooltip that explains the action in more detail for assistive context.`,children:(0,o.jsx)(r,{variant:`ghost`,children:`Details`})})},d=[`Default`,`CompactAndRich`,`LongContent`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <SimpleTooltip content='Save changes' contentVariant='compact'>
      <Button variant='secondary'>Hover me</Button>
    </SimpleTooltip>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-6'>
      <SimpleTooltip content='Copy link' contentVariant='compact' defaultOpen>
        <Button variant='secondary'>Compact label</Button>
      </SimpleTooltip>
      <SimpleTooltip content='Copies the public profile URL so you can share it anywhere.' contentVariant='rich' defaultOpen side='bottom' showArrow>
        <Button variant='secondary'>Rich explanation</Button>
      </SimpleTooltip>
    </div>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <SimpleTooltip content='A longer tooltip that explains the action in more detail for assistive context.'>
      <Button variant='ghost'>Details</Button>
    </SimpleTooltip>
}`,...u.parameters?.docs?.source}}}})))()}f();export{l as CompactAndRich,c as Default,u as LongContent,d as __namedExportsOrder,s as default};