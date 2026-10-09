import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./checkbox-Dx7-s60Q.js";import{n as i,t as a}from"./label-CaJvPCxj.js";var o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{o=t(),n(),i(),s={title:`UI/Atoms/Checkbox`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},c={render:()=>(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(r,{id:`cb-default`}),(0,o.jsx)(a,{htmlFor:`cb-default`,children:`Subscribe`})]})},l={render:()=>(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(r,{id:`cb-checked`,defaultChecked:!0}),(0,o.jsx)(a,{htmlFor:`cb-checked`,children:`Subscribed`})]})},u={render:()=>(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(r,{id:`cb-indeterminate`,checked:`indeterminate`}),(0,o.jsx)(a,{htmlFor:`cb-indeterminate`,children:`Some tracks selected`})]})},d={render:()=>(0,o.jsxs)(`div`,{className:`grid gap-3`,children:[(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(r,{id:`cb-dis`,disabled:!0}),(0,o.jsx)(a,{htmlFor:`cb-dis`,children:`Disabled`})]}),(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(r,{id:`cb-dis-checked`,disabled:!0,defaultChecked:!0}),(0,o.jsx)(a,{htmlFor:`cb-dis-checked`,children:`Disabled and checked`})]})]})},f={render:()=>(0,o.jsx)(`div`,{className:`grid gap-4`,children:[{id:`cb-matrix-off`,label:`Unchecked`},{id:`cb-matrix-on`,label:`Checked`,checked:!0},{id:`cb-matrix-mixed`,label:`Indeterminate`,checked:`indeterminate`}].map(e=>(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(r,{id:e.id,checked:e.checked}),(0,o.jsx)(a,{htmlFor:e.id,children:e.label})]},e.id))})},p=[`Default`,`Checked`,`Indeterminate`,`Disabled`,`StateMatrix`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      <Checkbox id='cb-default' />
      <Label htmlFor='cb-default'>Subscribe</Label>
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      <Checkbox id='cb-checked' defaultChecked />
      <Label htmlFor='cb-checked'>Subscribed</Label>
    </div>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      <Checkbox id='cb-indeterminate' checked='indeterminate' />
      <Label htmlFor='cb-indeterminate'>Some tracks selected</Label>
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-3'>
      <div className='flex items-center gap-2'>
        <Checkbox id='cb-dis' disabled />
        <Label htmlFor='cb-dis'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='cb-dis-checked' disabled defaultChecked />
        <Label htmlFor='cb-dis-checked'>Disabled and checked</Label>
      </div>
    </div>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-4'>
      {[{
      id: 'cb-matrix-off',
      label: 'Unchecked'
    }, {
      id: 'cb-matrix-on',
      label: 'Checked',
      checked: true
    }, {
      id: 'cb-matrix-mixed',
      label: 'Indeterminate',
      checked: 'indeterminate' as const
    }].map(item => <div className='flex items-center gap-2' key={item.id}>
          <Checkbox id={item.id} checked={item.checked} />
          <Label htmlFor={item.id}>{item.label}</Label>
        </div>)}
    </div>
}`,...f.parameters?.docs?.source}}}})))()}m();export{l as Checked,c as Default,d as Disabled,u as Indeterminate,f as StateMatrix,p as __namedExportsOrder,s as default};