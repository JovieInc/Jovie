import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DashboardCard-DPaZB3kZ.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),a={title:`Dashboard/Atoms/DashboardCard`,component:r,parameters:{layout:`centered`},argTypes:{variant:{control:`select`,options:[`default`,`interactive`,`settings`,`analytics`,`empty-state`]},padding:{control:`select`,options:[`default`,`large`,`compact`]},hover:{control:`boolean`}}},o={args:{variant:`default`,padding:`default`,children:(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`h3`,{className:`font-semibold mb-2`,children:`Card Title`}),(0,i.jsx)(`p`,{className:`text-secondary text-sm`,children:`This is a default dashboard card.`})]}),className:`w-80`}},s={args:{variant:`interactive`,padding:`default`,onClick:()=>console.log(`Card clicked`),children:(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`h3`,{className:`font-semibold mb-2`,children:`Interactive Card`}),(0,i.jsx)(`p`,{className:`text-secondary text-sm`,children:`Click me to trigger an action.`})]}),className:`w-80`}},c={args:{variant:`settings`,padding:`default`,children:(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`h3`,{className:`font-semibold mb-2`,children:`Settings Card`}),(0,i.jsx)(`p`,{className:`text-secondary text-sm`,children:`Configure your preferences here.`})]}),className:`w-80`}},l={args:{variant:`analytics`,padding:`large`,children:(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`p`,{className:`text-sm text-secondary mb-1`,children:`Total Views`}),(0,i.jsx)(`p`,{className:`text-3xl font-bold`,children:`12,345`}),(0,i.jsx)(`p`,{className:`text-sm text-green-600 mt-1`,children:`+12% from last week`})]}),className:`w-64`}},u={args:{variant:`empty-state`,padding:`large`,children:(0,i.jsxs)(`div`,{className:`text-center`,children:[(0,i.jsx)(`p`,{className:`text-lg mb-2`,children:`No data yet`}),(0,i.jsx)(`p`,{className:`text-secondary text-sm`,children:`Start by adding your first link.`})]}),className:`w-80`}},d={args:{variant:`default`,padding:`compact`,children:(0,i.jsxs)(`div`,{className:`flex items-center justify-between`,children:[(0,i.jsx)(`span`,{className:`font-medium`,children:`Quick Action`}),(0,i.jsx)(`span`,{className:`text-secondary`,children:`→`})]}),className:`w-80`}},f={render:()=>(0,i.jsxs)(`div`,{className:`grid grid-cols-2 gap-4 w-150`,children:[(0,i.jsx)(r,{variant:`default`,children:(0,i.jsx)(`p`,{className:`font-medium`,children:`Default`})}),(0,i.jsx)(r,{variant:`interactive`,onClick:()=>{},children:(0,i.jsx)(`p`,{className:`font-medium`,children:`Interactive`})}),(0,i.jsx)(r,{variant:`settings`,children:(0,i.jsx)(`p`,{className:`font-medium`,children:`Settings`})}),(0,i.jsx)(r,{variant:`analytics`,children:(0,i.jsx)(`p`,{className:`font-medium`,children:`Analytics`})})]})},p=[`Default`,`Interactive`,`Settings`,`Analytics`,`EmptyState`,`CompactPadding`,`AllVariants`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'default',
    padding: 'default',
    children: <div>
        <h3 className='font-semibold mb-2'>Card Title</h3>
        <p className='text-secondary text-sm'>
          This is a default dashboard card.
        </p>
      </div>,
    className: 'w-80'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'interactive',
    padding: 'default',
    onClick: () => console.log('Card clicked'),
    children: <div>
        <h3 className='font-semibold mb-2'>Interactive Card</h3>
        <p className='text-secondary text-sm'>Click me to trigger an action.</p>
      </div>,
    className: 'w-80'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'settings',
    padding: 'default',
    children: <div>
        <h3 className='font-semibold mb-2'>Settings Card</h3>
        <p className='text-secondary text-sm'>
          Configure your preferences here.
        </p>
      </div>,
    className: 'w-80'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'analytics',
    padding: 'large',
    children: <div>
        <p className='text-sm text-secondary mb-1'>Total Views</p>
        <p className='text-3xl font-bold'>12,345</p>
        <p className='text-sm text-green-600 mt-1'>+12% from last week</p>
      </div>,
    className: 'w-64'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'empty-state',
    padding: 'large',
    children: <div className='text-center'>
        <p className='text-lg mb-2'>No data yet</p>
        <p className='text-secondary text-sm'>
          Start by adding your first link.
        </p>
      </div>,
    className: 'w-80'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'default',
    padding: 'compact',
    children: <div className='flex items-center justify-between'>
        <span className='font-medium'>Quick Action</span>
        <span className='text-secondary'>→</span>
      </div>,
    className: 'w-80'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-2 gap-4 w-150'>
      <DashboardCard variant='default'>
        <p className='font-medium'>Default</p>
      </DashboardCard>
      <DashboardCard variant='interactive' onClick={() => {}}>
        <p className='font-medium'>Interactive</p>
      </DashboardCard>
      <DashboardCard variant='settings'>
        <p className='font-medium'>Settings</p>
      </DashboardCard>
      <DashboardCard variant='analytics'>
        <p className='font-medium'>Analytics</p>
      </DashboardCard>
    </div>
}`,...f.parameters?.docs?.source}}}})))()}m();export{f as AllVariants,l as Analytics,d as CompactPadding,o as Default,u as EmptyState,s as Interactive,c as Settings,p as __namedExportsOrder,a as default};