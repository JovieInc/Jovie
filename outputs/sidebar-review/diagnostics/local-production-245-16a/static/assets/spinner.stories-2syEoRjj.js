import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./spinner-DFr-ocjD.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={title:`UI/Atoms/Spinner`,component:r,parameters:{layout:`centered`,docs:{description:{component:`Inline spinner for buttons and in-flight actions. See packages/ui/docs/loading-states.md.`}}}},o={args:{size:`md`,tone:`primary`}},s={args:{size:`sm`,tone:`muted`}},c={args:{size:`lg`,tone:`inverse`},decorators:[e=>(0,i.jsx)(`div`,{className:`rounded-lg border border-subtle bg-surface-3 p-4`,children:(0,i.jsx)(e,{})})]},l={render:()=>(0,i.jsx)(`div`,{className:`grid grid-cols-3 items-center gap-5`,children:[`primary`,`muted`,`inverse`].flatMap(e=>[`sm`,`md`,`lg`].map(t=>(0,i.jsxs)(`div`,{className:e===`inverse`?`grid justify-items-center gap-2 rounded-lg bg-surface-3 p-3`:`grid justify-items-center gap-2 p-3`,children:[(0,i.jsx)(r,{size:t,tone:e,label:`${t} ${e} loading`}),(0,i.jsxs)(`span`,{className:`text-2xs text-tertiary-token`,children:[t,` / `,e]})]},`${e}-${t}`)))})},u=[`Medium`,`SmallMuted`,`LargeInverse`,`SizeAndToneMatrix`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'md',
    tone: 'primary'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'sm',
    tone: 'muted'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'lg',
    tone: 'inverse'
  },
  decorators: [Story => <div className='rounded-lg border border-subtle bg-surface-3 p-4'>
        <Story />
      </div>]
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-3 items-center gap-5'>
      {(['primary', 'muted', 'inverse'] as const).flatMap(tone => (['sm', 'md', 'lg'] as const).map(size => <div key={\`\${tone}-\${size}\`} className={tone === 'inverse' ? 'grid justify-items-center gap-2 rounded-lg bg-surface-3 p-3' : 'grid justify-items-center gap-2 p-3'}>
            <Spinner size={size} tone={tone} label={\`\${size} \${tone} loading\`} />
            <span className='text-2xs text-tertiary-token'>
              {size} / {tone}
            </span>
          </div>))}
    </div>
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as LargeInverse,o as Medium,l as SizeAndToneMatrix,s as SmallMuted,u as __namedExportsOrder,a as default};