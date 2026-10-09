import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./close-button-B2m3CqCG.js";var a,o,s,c,l,u;function d(){return(d=e((()=>{a=t(),r(),o={title:`UI/Atoms/CloseButton`,parameters:{layout:`centered`},tags:[`autodocs`]},s={render:()=>(0,a.jsxs)(`div`,{className:`relative h-40 w-72 rounded-xl border border-subtle bg-surface-1 p-5`,children:[(0,a.jsx)(`p`,{className:`font-medium text-primary-token`,children:`Entity details`}),(0,a.jsx)(`p`,{className:`mt-2 text-sm text-secondary-token`,children:`Close controls share one target, radius, and focus treatment.`}),(0,a.jsx)(`button`,{type:`button`,className:n,"aria-label":`Close`,children:(0,a.jsx)(i,{})})]})},c={render:()=>(0,a.jsx)(`div`,{className:`relative h-28 w-64 rounded-xl border border-subtle bg-surface-1`,children:(0,a.jsx)(`button`,{type:`button`,className:n,disabled:!0,"aria-label":`Close`,children:(0,a.jsx)(i,{})})})},l={render:()=>(0,a.jsx)(`div`,{className:`flex items-center gap-3 text-secondary-token`,children:[3,4,5].map(e=>(0,a.jsx)(`button`,{type:`button`,className:`inline-flex size-12 items-center justify-center rounded-full border border-subtle hover:bg-interactive-hover hover:text-primary-token`,"aria-label":`Close with ${e*4} pixel icon`,children:(0,a.jsx)(i,{size:e})},e))})},u=[`Default`,`Disabled`,`IconSizes`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className='relative h-40 w-72 rounded-xl border border-subtle bg-surface-1 p-5'>
      <p className='font-medium text-primary-token'>Entity details</p>
      <p className='mt-2 text-sm text-secondary-token'>
        Close controls share one target, radius, and focus treatment.
      </p>
      <button type='button' className={closeButtonClassName} aria-label='Close'>
        <CloseButtonIcon />
      </button>
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='relative h-28 w-64 rounded-xl border border-subtle bg-surface-1'>
      <button type='button' className={closeButtonClassName} disabled aria-label='Close'>
        <CloseButtonIcon />
      </button>
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-3 text-secondary-token'>
      {[3, 4, 5].map(size => <button key={size} type='button' className='inline-flex size-12 items-center justify-center rounded-full border border-subtle hover:bg-interactive-hover hover:text-primary-token' aria-label={\`Close with \${size * 4} pixel icon\`}>
          <CloseButtonIcon size={size} />
        </button>)}
    </div>
}`,...l.parameters?.docs?.source}}}})))()}d();export{s as Default,c as Disabled,l as IconSizes,u as __namedExportsOrder,o as default};