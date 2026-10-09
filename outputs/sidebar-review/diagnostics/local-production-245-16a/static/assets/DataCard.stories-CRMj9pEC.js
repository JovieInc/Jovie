import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{i,t as a}from"./utils-AN1vFgqV.js";function o({title:e,subtitle:t,metadata:n,badge:r,badgeVariant:i=`default`,actions:o,className:c,children:l}){return(0,s.jsxs)(`div`,{className:a(`flex items-center justify-between rounded-lg border border-subtle bg-surface-1 p-3 shadow-card transition-colors`,c),children:[(0,s.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,s.jsxs)(`div`,{className:`flex items-center space-x-2`,children:[(0,s.jsx)(`p`,{className:`font-medium truncate`,title:e,children:e}),r&&r.trim()!==``&&(0,s.jsx)(`span`,{className:a(`inline-block px-2 py-1 text-xs rounded-full`,{default:`bg-surface-hover text-secondary`,success:`bg-success-subtle text-success`,warning:`bg-warning-subtle text-warning`,error:`bg-error-subtle text-error`}[i]),children:r})]}),t&&t.trim()!==``&&(0,s.jsx)(`p`,{className:`text-sm text-secondary truncate`,title:t,children:t}),n&&n.trim()!==``&&(0,s.jsx)(`p`,{className:`text-xs text-secondary`,children:n}),l]}),o&&(0,s.jsx)(`div`,{className:`flex-shrink-0 ml-4`,children:o})]})}var s;function c(){return(c=e((()=>{s=t(),i()})))()}var l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{l=t(),n(),c(),u={title:`Molecules/DataCard`,component:o,parameters:{layout:`centered`},argTypes:{badgeVariant:{control:`select`,options:[`default`,`success`,`warning`,`error`]}}},d={args:{title:`spotify.com/artist/johndoe`,subtitle:`Spotify Artist Profile`,className:`w-96`}},f={args:{title:`instagram.com/johndoe`,subtitle:`Instagram Profile`,badge:`Active`,badgeVariant:`success`,className:`w-96`}},p={args:{title:`Latest Release`,subtitle:`Summer Vibes EP`,metadata:`Released on Jan 15, 2024`,badge:`New`,badgeVariant:`default`,className:`w-96`}},m={args:{title:`soundcloud.com/johndoe`,subtitle:`SoundCloud Profile`,badge:`Pending`,badgeVariant:`warning`,className:`w-96`,actions:(0,l.jsx)(r,{variant:`outline`,size:`sm`,children:`Edit`})}},h={args:{title:`broken-link.com/profile`,subtitle:`Link verification failed`,badge:`Error`,badgeVariant:`error`,className:`w-96`,actions:(0,l.jsx)(r,{variant:`destructive`,size:`sm`,children:`Remove`})}},g={render:()=>(0,l.jsxs)(`div`,{className:`space-y-3 w-96`,children:[(0,l.jsx)(o,{title:`Default Badge`,subtitle:`Standard styling`,badge:`Default`,badgeVariant:`default`}),(0,l.jsx)(o,{title:`Success Badge`,subtitle:`Verified and active`,badge:`Active`,badgeVariant:`success`}),(0,l.jsx)(o,{title:`Warning Badge`,subtitle:`Needs attention`,badge:`Pending`,badgeVariant:`warning`}),(0,l.jsx)(o,{title:`Error Badge`,subtitle:`Action required`,badge:`Failed`,badgeVariant:`error`})]})},_=[`Default`,`WithBadge`,`WithMetadata`,`WithActions`,`ErrorState`,`AllVariants`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'spotify.com/artist/johndoe',
    subtitle: 'Spotify Artist Profile',
    className: 'w-96'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'instagram.com/johndoe',
    subtitle: 'Instagram Profile',
    badge: 'Active',
    badgeVariant: 'success',
    className: 'w-96'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Latest Release',
    subtitle: 'Summer Vibes EP',
    metadata: 'Released on Jan 15, 2024',
    badge: 'New',
    badgeVariant: 'default',
    className: 'w-96'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'soundcloud.com/johndoe',
    subtitle: 'SoundCloud Profile',
    badge: 'Pending',
    badgeVariant: 'warning',
    className: 'w-96',
    actions: <Button variant='outline' size='sm'>
        Edit
      </Button>
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'broken-link.com/profile',
    subtitle: 'Link verification failed',
    badge: 'Error',
    badgeVariant: 'error',
    className: 'w-96',
    actions: <Button variant='destructive' size='sm'>
        Remove
      </Button>
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-3 w-96'>
      <DataCard title='Default Badge' subtitle='Standard styling' badge='Default' badgeVariant='default' />
      <DataCard title='Success Badge' subtitle='Verified and active' badge='Active' badgeVariant='success' />
      <DataCard title='Warning Badge' subtitle='Needs attention' badge='Pending' badgeVariant='warning' />
      <DataCard title='Error Badge' subtitle='Action required' badge='Failed' badgeVariant='error' />
    </div>
}`,...g.parameters?.docs?.source}}}})))()}v();export{g as AllVariants,d as Default,h as ErrorState,m as WithActions,f as WithBadge,p as WithMetadata,_ as __namedExportsOrder,u as default};