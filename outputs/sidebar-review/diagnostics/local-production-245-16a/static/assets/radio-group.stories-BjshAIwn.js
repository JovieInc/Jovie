import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./label-CaJvPCxj.js";import{n as i,r as a,t as o}from"./radio-group-X9pgobEG.js";var s,c,l,u,d,f;function p(){return(p=e((()=>{s=t(),n(),a(),c={title:`UI/Atoms/RadioGroup`,component:o,parameters:{layout:`centered`},tags:[`autodocs`]},l={render:()=>(0,s.jsxs)(o,{defaultValue:`a`,className:`flex flex-col gap-2`,children:[(0,s.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,s.jsx)(i,{value:`a`,id:`rg-a`}),(0,s.jsx)(r,{htmlFor:`rg-a`,children:`Option A`})]}),(0,s.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,s.jsx)(i,{value:`b`,id:`rg-b`}),(0,s.jsx)(r,{htmlFor:`rg-b`,children:`Option B`})]})]})},u={render:()=>(0,s.jsxs)(o,{defaultValue:`a`,disabled:!0,className:`flex gap-6`,children:[(0,s.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,s.jsx)(i,{value:`a`,id:`rg-da`}),(0,s.jsx)(r,{htmlFor:`rg-da`,children:`Selected`})]}),(0,s.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,s.jsx)(i,{value:`b`,id:`rg-db`}),(0,s.jsx)(r,{htmlFor:`rg-db`,children:`Unselected`})]})]})},d={render:()=>(0,s.jsx)(o,{defaultValue:`email`,className:`flex gap-6`,children:[[`email`,`Email`],[`sms`,`SMS`],[`none`,`None`]].map(([e,t])=>(0,s.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,s.jsx)(i,{value:e,id:`rg-${e}`}),(0,s.jsx)(r,{htmlFor:`rg-${e}`,children:t})]},e))})},f=[`Default`,`Disabled`,`Horizontal`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue='a' className='flex flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='a' id='rg-a' />
        <Label htmlFor='rg-a'>Option A</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='b' id='rg-b' />
        <Label htmlFor='rg-b'>Option B</Label>
      </div>
    </RadioGroup>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue='a' disabled className='flex gap-6'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='a' id='rg-da' />
        <Label htmlFor='rg-da'>Selected</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='b' id='rg-db' />
        <Label htmlFor='rg-db'>Unselected</Label>
      </div>
    </RadioGroup>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue='email' className='flex gap-6'>
      {[['email', 'Email'], ['sms', 'SMS'], ['none', 'None']].map(([value, label]) => <div className='flex items-center gap-2' key={value}>
          <RadioGroupItem value={value} id={\`rg-\${value}\`} />
          <Label htmlFor={\`rg-\${value}\`}>{label}</Label>
        </div>)}
    </RadioGroup>
}`,...d.parameters?.docs?.source}}}})))()}p();export{l as Default,u as Disabled,d as Horizontal,f as __namedExportsOrder,c as default};