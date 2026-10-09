import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./status-glyph-x4DeN9S6.js";var a,o,s,c,l,u;function d(){return(d=e((()=>{a=t(),r(),o={title:`UI/Atoms/StatusGlyph`,component:n,parameters:{layout:`centered`},tags:[`autodocs`]},s={render:()=>(0,a.jsx)(`div`,{className:`flex items-center gap-4`,children:i.map(e=>(0,a.jsx)(n,{state:e},e))})},c={render:()=>(0,a.jsx)(`div`,{className:`flex items-center gap-4`,children:i.map(e=>(0,a.jsx)(n,{state:e,label:e},e))})},l={render:()=>(0,a.jsx)(`div`,{className:`flex items-center gap-3`,children:i.map(e=>(0,a.jsx)(n,{state:e,size:`sm`},e))})},u=[`AllStates`,`WithLabels`,`Small`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-4'>
      {STATUS_GLYPH_STATES.map(state => <StatusGlyph key={state} state={state} />)}
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-4'>
      {STATUS_GLYPH_STATES.map(state => <StatusGlyph key={state} state={state} label={state} />)}
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-3'>
      {STATUS_GLYPH_STATES.map(state => <StatusGlyph key={state} state={state} size='sm' />)}
    </div>
}`,...l.parameters?.docs?.source}}}})))()}d();export{s as AllStates,l as Small,c as WithLabels,u as __namedExportsOrder,o as default};