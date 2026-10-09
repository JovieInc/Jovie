import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r,n as i,o as a,r as o,t as s}from"./select-DVI0eVz3.js";var c,l,u,d,f,p;function m(){return(m=e((()=>{c=t(),a(),l={title:`UI/Atoms/Select`,parameters:{layout:`centered`},tags:[`autodocs`]},u={render:()=>(0,c.jsxs)(s,{defaultValue:`pro`,children:[(0,c.jsx)(r,{className:`w-48`,"aria-label":`Plan`,children:(0,c.jsx)(n,{placeholder:`Pick a plan`})}),(0,c.jsxs)(i,{children:[(0,c.jsx)(o,{value:`free`,children:`Free`}),(0,c.jsx)(o,{value:`pro`,children:`Pro`}),(0,c.jsx)(o,{value:`team`,disabled:!0,children:`Team`})]})]})},d={render:()=>(0,c.jsxs)(s,{disabled:!0,defaultValue:`pro`,children:[(0,c.jsx)(r,{className:`w-48`,"aria-label":`Plan`,children:(0,c.jsx)(n,{})}),(0,c.jsx)(i,{children:(0,c.jsx)(o,{value:`pro`,children:`Pro`})})]})},f={parameters:{layout:`fullscreen`},render:()=>(0,c.jsx)(`div`,{className:`flex min-h-64 items-start justify-end p-2`,children:(0,c.jsxs)(s,{defaultOpen:!0,defaultValue:`north-america`,children:[(0,c.jsx)(r,{className:`w-48`,"aria-label":`Coverage`,children:(0,c.jsx)(n,{placeholder:`Pick coverage`})}),(0,c.jsxs)(i,{align:`end`,children:[(0,c.jsx)(o,{value:`worldwide`,children:`Worldwide`}),(0,c.jsx)(o,{value:`north-america`,children:`North America`}),(0,c.jsx)(o,{value:`europe`,children:`Europe`}),(0,c.jsx)(o,{value:`asia`,children:`Asia`})]})]})})},p=[`Default`,`Disabled`,`EdgeCollision`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <Select defaultValue='pro'>
      <SelectTrigger className='w-48' aria-label='Plan'>
        <SelectValue placeholder='Pick a plan' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='free'>Free</SelectItem>
        <SelectItem value='pro'>Pro</SelectItem>
        <SelectItem value='team' disabled>
          Team
        </SelectItem>
      </SelectContent>
    </Select>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <Select disabled defaultValue='pro'>
      <SelectTrigger className='w-48' aria-label='Plan'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='pro'>Pro</SelectItem>
      </SelectContent>
    </Select>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'fullscreen'
  },
  render: () => <div className='flex min-h-64 items-start justify-end p-2'>
      <Select defaultOpen defaultValue='north-america'>
        <SelectTrigger className='w-48' aria-label='Coverage'>
          <SelectValue placeholder='Pick coverage' />
        </SelectTrigger>
        <SelectContent align='end'>
          <SelectItem value='worldwide'>Worldwide</SelectItem>
          <SelectItem value='north-america'>North America</SelectItem>
          <SelectItem value='europe'>Europe</SelectItem>
          <SelectItem value='asia'>Asia</SelectItem>
        </SelectContent>
      </Select>
    </div>
}`,...f.parameters?.docs?.source}}}})))()}m();export{u as Default,d as Disabled,f as EdgeCollision,p as __namedExportsOrder,l as default};