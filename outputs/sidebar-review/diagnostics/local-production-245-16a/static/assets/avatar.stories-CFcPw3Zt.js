import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r,n as i,r as a,s as o,t as s}from"./avatar-BiiFm6lb.js";var c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{c=t(),o(),l={title:`UI/Atoms/Avatar`,component:s,parameters:{layout:`centered`},tags:[`autodocs`]},u={render:()=>(0,c.jsx)(s,{size:`lg`,children:(0,c.jsx)(i,{children:`TW`})})},d={render:()=>(0,c.jsxs)(s,{size:`lg`,ring:!0,children:[(0,c.jsx)(a,{src:`https://cdn.jov.ie/static/placeholder-avatar.png`,alt:`Artist`}),(0,c.jsx)(r,{status:`online`,size:`lg`})]})},f={render:()=>(0,c.jsxs)(`div`,{className:`flex items-end gap-6`,children:[(0,c.jsxs)(`div`,{className:`grid justify-items-center gap-2`,children:[(0,c.jsx)(s,{size:`2xl`,shape:`artwork`,children:(0,c.jsx)(a,{src:`https://placehold.co/400x600/111827/E5E7EB?text=Full+Artwork`,alt:`Full release artwork using inherited props`})}),(0,c.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`Inherited`})]}),(0,c.jsxs)(`div`,{className:`grid justify-items-center gap-2`,children:[(0,c.jsx)(s,{size:`2xl`,shape:`artwork`,children:(0,c.jsx)(a,{src:`https://placehold.co/400x600/111827/E5E7EB?text=Full+Artwork`,alt:`Full release artwork using explicit props`,size:`2xl`,shape:`artwork`})}),(0,c.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`Explicit`})]})]}),parameters:{docs:{description:{story:`Artwork children inherit the parent rounded-square geometry and preserve the full image with contain fit; explicit matching props remain supported.`}}}},p={render:()=>(0,c.jsx)(n,{name:`Tim White`,size:`xl`,status:`away`})},m={render:()=>(0,c.jsx)(`div`,{className:`flex items-end gap-3`,children:[`xs`,`sm`,`md`,`lg`,`xl`,`2xl`].map(e=>(0,c.jsx)(s,{size:e,children:(0,c.jsx)(i,{size:e,children:e})},e))})},h={render:()=>(0,c.jsx)(`div`,{className:`flex items-center gap-4`,children:[`online`,`away`,`offline`].map(e=>(0,c.jsxs)(`div`,{className:`grid justify-items-center gap-2`,children:[(0,c.jsx)(n,{name:e,size:`lg`,status:e}),(0,c.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:e})]},e))})},g=[`Default`,`WithImage`,`ArtworkComposition`,`User`,`Sizes`,`PresenceStates`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <Avatar size='lg'>
      <AvatarFallback>TW</AvatarFallback>
    </Avatar>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <Avatar size='lg' ring>
      <AvatarImage src='https://cdn.jov.ie/static/placeholder-avatar.png' alt='Artist' />
      <AvatarStatusDot status='online' size='lg' />
    </Avatar>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-end gap-6'>
      <div className='grid justify-items-center gap-2'>
        <Avatar size='2xl' shape='artwork'>
          <AvatarImage src='https://placehold.co/400x600/111827/E5E7EB?text=Full+Artwork' alt='Full release artwork using inherited props' />
        </Avatar>
        <span className='text-xs text-tertiary-token'>Inherited</span>
      </div>
      <div className='grid justify-items-center gap-2'>
        <Avatar size='2xl' shape='artwork'>
          <AvatarImage src='https://placehold.co/400x600/111827/E5E7EB?text=Full+Artwork' alt='Full release artwork using explicit props' size='2xl' shape='artwork' />
        </Avatar>
        <span className='text-xs text-tertiary-token'>Explicit</span>
      </div>
    </div>,
  parameters: {
    docs: {
      description: {
        story: 'Artwork children inherit the parent rounded-square geometry and preserve the full image with contain fit; explicit matching props remain supported.'
      }
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <UserAvatar name='Tim White' size='xl' status='away' />
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-end gap-3'>
      {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map(size => <Avatar key={size} size={size}>
          <AvatarFallback size={size}>{size}</AvatarFallback>
        </Avatar>)}
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-4'>
      {(['online', 'away', 'offline'] as const).map(status => <div key={status} className='grid justify-items-center gap-2'>
          <UserAvatar name={status} size='lg' status={status} />
          <span className='text-xs text-tertiary-token'>{status}</span>
        </div>)}
    </div>
}`,...h.parameters?.docs?.source}}}})))()}_();export{f as ArtworkComposition,u as Default,h as PresenceStates,m as Sizes,p as User,d as WithImage,g as __namedExportsOrder,l as default};