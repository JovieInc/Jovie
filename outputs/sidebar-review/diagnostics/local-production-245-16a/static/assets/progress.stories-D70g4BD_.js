import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./progress-UV5I_KTq.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`UI/Atoms/ProgressBar`,component:r,parameters:{docs:{description:{component:`Upload/import progress with optional label slot. See packages/ui/docs/loading-states.md.`}}}},o={args:{value:42,label:`Importing releases`,showValue:!0}},s={args:{indeterminate:!0,label:`Finding music across platforms`}},c={render:()=>(0,i.jsxs)(`div`,{className:`grid w-80 gap-5`,children:[(0,i.jsx)(r,{value:25,label:`Preparing upload`,showValue:!0}),(0,i.jsx)(r,{value:100,min:50,max:150,label:`Catalog import`,showValue:!0}),(0,i.jsx)(r,{indeterminate:!0,label:`Matching profiles`})]})},l=[`Determinate`,`Indeterminate`,`RangeAndStates`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    value: 42,
    label: 'Importing releases',
    showValue: true
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    indeterminate: true,
    label: 'Finding music across platforms'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid w-80 gap-5'>
      <ProgressBar value={25} label='Preparing upload' showValue />
      <ProgressBar value={100} min={50} max={150} label='Catalog import' showValue />
      <ProgressBar indeterminate label='Matching profiles' />
    </div>
}`,...c.parameters?.docs?.source}}}})))()}u();export{o as Determinate,s as Indeterminate,c as RangeAndStates,l as __namedExportsOrder,a as default};