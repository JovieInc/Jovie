import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./Container-BAXViFRB.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`Site/Container`,component:r,parameters:{layout:`fullscreen`,docs:{description:{component:`Compatibility container with the canonical public-content width aliases. MarketingContainer remains the canonical marketing shell owner.`}}},tags:[`autodocs`]},o={sm:`sm (legacy)`,md:`md (legacy)`,lg:`lg (canonical)`,xl:`xl (canonical alias)`,homepage:`homepage (canonical alias)`,full:`full`},s={args:{children:null},render:()=>(0,i.jsx)(`div`,{className:`bg-base py-8 text-primary-token`,children:(0,i.jsx)(r,{children:(0,i.jsxs)(`div`,{className:`rounded-lg border border-subtle bg-surface-1 p-6`,children:[(0,i.jsx)(`h2`,{className:`text-lg font-semibold`,children:`Public content container`}),(0,i.jsx)(`p`,{className:`mt-2 text-secondary-token`,children:`The default maps to the canonical public-content max width.`})]})})})},c={args:{children:null},render:()=>(0,i.jsx)(`div`,{className:`space-y-4 bg-base py-8 text-primary-token`,children:Object.keys(o).map(e=>(0,i.jsx)(r,{size:e,children:(0,i.jsx)(`div`,{className:`rounded-lg border border-subtle bg-surface-1 px-4 py-3 text-sm`,children:o[e]})},e))})},l=[`Default`,`SizeMatrix`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <div className='bg-base py-8 text-primary-token'>
      <Container>
        <div className='rounded-lg border border-subtle bg-surface-1 p-6'>
          <h2 className='text-lg font-semibold'>Public content container</h2>
          <p className='mt-2 text-secondary-token'>
            The default maps to the canonical public-content max width.
          </p>
        </div>
      </Container>
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <div className='space-y-4 bg-base py-8 text-primary-token'>
      {(Object.keys(SIZE_LABELS) as Array<keyof typeof SIZE_LABELS>).map(size => <Container key={size} size={size}>
            <div className='rounded-lg border border-subtle bg-surface-1 px-4 py-3 text-sm'>
              {SIZE_LABELS[size]}
            </div>
          </Container>)}
    </div>
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as Default,c as SizeMatrix,l as __namedExportsOrder,a as default};