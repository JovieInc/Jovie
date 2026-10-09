import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./ContentSurfaceCard-NsoaLSLh.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={title:`Molecules/ContentSurfaceCard`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-[34rem] max-w-[calc(100vw-2rem)] bg-surface-0 p-6 text-primary-token`,children:(0,i.jsx)(e,{})})],args:{children:`Content surface`,className:`p-4`}},o={},s={render:()=>(0,i.jsx)(`div`,{className:`grid grid-cols-2 gap-3`,children:[`default`,`details`,`marketing`,`settings`,`table`].map(e=>(0,i.jsx)(r,{surface:e,className:`p-4`,children:(0,i.jsx)(`p`,{className:`text-sm font-medium capitalize`,children:e})},e))})},c={render:()=>(0,i.jsxs)(r,{className:`space-y-3 p-4`,children:[(0,i.jsx)(`p`,{className:`text-sm font-medium`,children:`Outer content surface`}),(0,i.jsx)(r,{surface:`nested`,className:`p-3`,children:(0,i.jsx)(`p`,{className:`text-sm text-secondary-token`,children:`Nested content surface`})})]})},l={render:()=>(0,i.jsxs)(`div`,{className:`grid gap-3`,children:[(0,i.jsx)(r,{as:`section`,className:`p-4`,"aria-label":`Summary`,children:(0,i.jsx)(`p`,{className:`text-sm`,children:`Semantic section`})}),(0,i.jsx)(r,{as:`button`,className:`p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55`,onClick:()=>void 0,children:(0,i.jsx)(`span`,{className:`text-sm font-medium`,children:`Native button surface`})})]})},u=[`Default`,`SurfaceVariants`,`Nested`,`SemanticAndInteractive`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-2 gap-3'>
      {(['default', 'details', 'marketing', 'settings', 'table'] as const).map(surface => <ContentSurfaceCard key={surface} surface={surface} className='p-4'>
            <p className='text-sm font-medium capitalize'>{surface}</p>
          </ContentSurfaceCard>)}
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <ContentSurfaceCard className='space-y-3 p-4'>
      <p className='text-sm font-medium'>Outer content surface</p>
      <ContentSurfaceCard surface='nested' className='p-3'>
        <p className='text-sm text-secondary-token'>Nested content surface</p>
      </ContentSurfaceCard>
    </ContentSurfaceCard>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-3'>
      <ContentSurfaceCard as='section' className='p-4' aria-label='Summary'>
        <p className='text-sm'>Semantic section</p>
      </ContentSurfaceCard>
      <ContentSurfaceCard as='button' className='p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55' onClick={() => undefined}>
        <span className='text-sm font-medium'>Native button surface</span>
      </ContentSurfaceCard>
    </div>
}`,...l.parameters?.docs?.source}}}})))()}d();export{o as Default,c as Nested,l as SemanticAndInteractive,s as SurfaceVariants,u as __namedExportsOrder,a as default};