import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerSurfaceCard-D5G20l_R.js";import{n as i,t as a}from"./DrawerLinkSection-swnSYhi1.js";var o,s,c,l,u;function d(){return(d=e((()=>{o=t(),i(),n(),s={title:`Molecules/Drawer/DrawerLinkSection`,component:a,parameters:{layout:`centered`},args:{title:`DSP Links`,onAdd:()=>void 0},decorators:[e=>(0,o.jsx)(`div`,{className:`w-80`,children:(0,o.jsx)(e,{})})]},c={args:{isEmpty:!0,emptyMessage:`No links yet.`,emptyStateTestId:`dsp-links-empty`,children:null}},l={args:{children:(0,o.jsx)(`div`,{className:`space-y-1.5`,children:[`Spotify`,`Apple Music`].map(e=>(0,o.jsx)(r,{className:`px-3 py-2`,children:(0,o.jsx)(`p`,{className:`text-xs text-primary-token`,children:e})},e))})}},u=[`Empty`,`WithLinks`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    isEmpty: true,
    emptyMessage: 'No links yet.',
    emptyStateTestId: 'dsp-links-empty',
    children: null
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    children: <div className='space-y-1.5'>
        {['Spotify', 'Apple Music'].map(label => <DrawerSurfaceCard key={label} className='px-3 py-2'>
            <p className='text-xs text-primary-token'>{label}</p>
          </DrawerSurfaceCard>)}
      </div>
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Empty,l as WithLinks,u as __namedExportsOrder,s as default};