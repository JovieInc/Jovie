import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./search-Binh2gA_.js";import{n as i,t as a}from"./EmptyState-yNZ1izLX.js";var o,s,c,l,u,d,f;function p(){return(p=e((()=>{o=t(),n(),i(),s={label:`Preparing…`,onClick:()=>void 0,disabled:!0},c={title:`UI/Molecules/EmptyState`,component:a,parameters:{layout:`centered`},tags:[`autodocs`]},l={args:{heading:`No Results Found`,description:`Try a different search or clear the current filters.`,icon:(0,o.jsx)(r,{className:`h-5 w-5`,"aria-hidden":`true`})}},u={args:{heading:`No Contacts Yet`,description:`Add bookings, management, and press contacts.`,presentation:`workspace`},render:e=>(0,o.jsx)(`div`,{className:`flex h-96 w-[min(40rem,calc(100vw-2rem))] bg-(--app-shell-content-surface)`,children:(0,o.jsx)(a,{...e})})},d={args:{heading:`Preparing Contacts`},render:()=>(0,o.jsx)(a,{heading:`Preparing Contacts`,description:`Your contacts will be ready shortly.`,action:s})},f=[`Default`,`Workspace`,`DisabledAction`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    heading: 'No Results Found',
    description: 'Try a different search or clear the current filters.',
    icon: <Search className='h-5 w-5' aria-hidden='true' />
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    heading: 'No Contacts Yet',
    description: 'Add bookings, management, and press contacts.',
    presentation: 'workspace'
  },
  render: args => <div className='flex h-96 w-[min(40rem,calc(100vw-2rem))] bg-(--app-shell-content-surface)'>
      <EmptyState {...args} />
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    heading: 'Preparing Contacts'
  },
  render: () => <EmptyState heading='Preparing Contacts' description='Your contacts will be ready shortly.' action={disabledAction} />
}`,...d.parameters?.docs?.source}}}})))()}p();export{l as Default,d as DisabledAction,u as Workspace,f as __namedExportsOrder,c as default};