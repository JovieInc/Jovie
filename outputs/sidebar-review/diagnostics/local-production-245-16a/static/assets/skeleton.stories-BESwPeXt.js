import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./skeleton-r-sDwcX3.js";var a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{a=t(),r(),o={title:`UI/Atoms/Skeleton`,component:n,parameters:{layout:`centered`,docs:{description:{component:`Loading shimmer uses the semantic skeleton base token (--color-skeleton-base). Reduced motion keeps the base fill and removes animation. See packages/ui/docs/loading-states.md.`}}},tags:[`autodocs`]},s={args:{className:`h-4 w-48`}},c={args:{className:`h-10 w-64`,shimmer:!0},parameters:{docs:{description:{story:`Canonical loading-shimmer state with an animated gradient when motion is allowed; reduced motion keeps the tokenized base fill.`}}}},l={args:{className:`h-10 w-64`,shimmer:!1}},u={render:()=>(0,a.jsx)(i,{lines:3,height:`h-4`,width:`w-64`,label:`Loading profile details`}),parameters:{docs:{description:{story:`LoadingSkeleton wrapper exposes aria-busy for assistive tech.`}}}},d={render:()=>(0,a.jsxs)(`div`,{className:`flex w-72 items-center gap-3`,children:[(0,a.jsx)(n,{className:`size-10 shrink-0`,rounded:`full`}),(0,a.jsx)(`div`,{className:`min-w-0 flex-1`,children:(0,a.jsx)(i,{lines:2,height:`h-3`,label:`Loading identity`})})]})},f=[`Default`,`LoadingShimmer`,`StaticPlaceholder`,`MultiLine`,`IdentityRow`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    className: 'h-4 w-48'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    className: 'h-10 w-64',
    shimmer: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Canonical loading-shimmer state with an animated gradient when motion is allowed; reduced motion keeps the tokenized base fill.'
      }
    }
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    className: 'h-10 w-64',
    shimmer: false
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <LoadingSkeleton lines={3} height='h-4' width='w-64' label='Loading profile details' />,
  parameters: {
    docs: {
      description: {
        story: 'LoadingSkeleton wrapper exposes aria-busy for assistive tech.'
      }
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex w-72 items-center gap-3'>
      <Skeleton className='size-10 shrink-0' rounded='full' />
      <div className='min-w-0 flex-1'>
        <LoadingSkeleton lines={2} height='h-3' label='Loading identity' />
      </div>
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{s as Default,d as IdentityRow,c as LoadingShimmer,u as MultiLine,l as StaticPlaceholder,f as __namedExportsOrder,o as default};