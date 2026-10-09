import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./segment-control-CnBrcWY4.js";function a({disabledOption:e=!1,variant:t=`default`,size:n=`md`,layout:r=`fill`,longLabels:a=!1}){let[o,l]=(0,c.useState)(`details`);return(0,s.jsx)(i,{value:o,onValueChange:l,"aria-label":`Profile view`,variant:t,size:n,layout:r,options:[{value:`details`,label:a?`Audience details and attributes`:`Details`},{value:`activity`,label:`Activity`,disabled:e},{value:`sources`,label:a?`Acquisition sources and referrals`:`Sources`}]})}function o(){let[e,t]=(0,c.useState)(`grid`);return(0,s.jsx)(i,{value:e,onValueChange:t,"aria-label":`Result layout`,layout:`hug`,variant:`linear-pill`,options:[{value:`grid`,label:(0,s.jsx)(`span`,{"aria-hidden":`true`,children:`▦`}),ariaLabel:`Grid view`},{value:`list`,label:(0,s.jsx)(`span`,{"aria-hidden":`true`,children:`☷`}),ariaLabel:`List view`}]})}var s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{s=n(),c=t(),r(),l={title:`UI/Atoms/SegmentControl`,component:i,parameters:{layout:`centered`,docs:{description:{component:`A compact, accessible control for mutually exclusive views. Every size keeps a 44px interaction target, long labels truncate safely, and the linear-pill indicator follows the shared System B geometry.`}}},tags:[`autodocs`]},u={render:()=>(0,s.jsx)(`div`,{className:`w-80`,children:(0,s.jsx)(a,{})})},d={render:()=>(0,s.jsx)(`div`,{className:`w-80`,children:(0,s.jsx)(a,{disabledOption:!0})})},f={render:()=>(0,s.jsxs)(`div`,{className:`grid w-96 gap-6 rounded-2xl bg-surface-page p-6`,children:[(0,s.jsx)(a,{variant:`default`}),(0,s.jsx)(a,{variant:`ghost`}),(0,s.jsx)(a,{variant:`linear-pill`,layout:`hug`})]})},p={render:()=>(0,s.jsxs)(`div`,{className:`grid w-96 gap-6 rounded-2xl bg-surface-page p-6`,children:[(0,s.jsx)(a,{size:`sm`}),(0,s.jsx)(a,{size:`md`}),(0,s.jsx)(a,{size:`lg`})]})},m={render:()=>(0,s.jsx)(`div`,{className:`w-64 rounded-2xl border border-subtle bg-surface-1 p-3`,children:(0,s.jsx)(a,{longLabels:!0})}),parameters:{docs:{description:{story:`Long labels remain within the control at narrow widths while their complete accessible names stay in the DOM.`}}}},h={render:()=>(0,s.jsx)(o,{})},g={render:()=>(0,s.jsx)(`div`,{className:`w-80`,children:(0,s.jsx)(a,{})}),parameters:{backgrounds:{default:`dark`}}},_=[`Default`,`WithDisabled`,`VariantMatrix`,`SizeMatrix`,`NarrowLongLabels`,`IconOnly`,`DarkMode`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-80'>
      <Demo />
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-80'>
      <Demo disabledOption />
    </div>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid w-96 gap-6 rounded-2xl bg-surface-page p-6'>
      <Demo variant='default' />
      <Demo variant='ghost' />
      <Demo variant='linear-pill' layout='hug' />
    </div>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid w-96 gap-6 rounded-2xl bg-surface-page p-6'>
      <Demo size='sm' />
      <Demo size='md' />
      <Demo size='lg' />
    </div>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-64 rounded-2xl border border-subtle bg-surface-1 p-3'>
      <Demo longLabels />
    </div>,
  parameters: {
    docs: {
      description: {
        story: 'Long labels remain within the control at narrow widths while their complete accessible names stay in the DOM.'
      }
    }
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <IconOnlyDemo />
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-80'>
      <Demo />
    </div>,
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{g as DarkMode,u as Default,h as IconOnly,m as NarrowLongLabels,p as SizeMatrix,f as VariantMatrix,d as WithDisabled,_ as __namedExportsOrder,l as default};