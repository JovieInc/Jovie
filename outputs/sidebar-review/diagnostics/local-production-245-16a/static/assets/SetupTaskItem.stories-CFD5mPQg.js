import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./check-C93bwYa6.js";import{r as i,t as a}from"./button-BSHhPV4e.js";function o({index:e,title:t,complete:n,completeLabel:i,incompleteLabel:a,action:o}){return(0,s.jsxs)(`li`,{className:`flex h-full flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 shadow-none`,children:[(0,s.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,s.jsx)(`div`,{className:`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-app font-caption ${n?`border border-subtle bg-surface-0 text-secondary-token`:`border border-accent/20 bg-accent/10 text-accent`}`,"aria-hidden":`true`,children:n?(0,s.jsx)(r,{className:`h-3.5 w-3.5`}):e}),(0,s.jsx)(`p`,{className:`truncate text-app font-semibold text-primary-token`,children:t})]}),(0,s.jsx)(`span`,{className:`truncate text-app leading-relaxed text-secondary-token`,children:n?i:a}),!n&&o?(0,s.jsx)(`div`,{className:`mt-auto flex shrink-0 [&_a]:min-h-11 [&_a]:flex [&_a]:items-center [&_button]:min-h-11`,children:o}):null]})}var s;function c(){return(c=e((()=>{s=t(),n()})))()}var l,u,d,f,p,m;function h(){return(h=e((()=>{l=t(),i(),c(),u={title:`Dashboard/Molecules/SetupTaskItem`,component:o,parameters:{layout:`centered`}},d={args:{index:1,title:`Add your profile photo`,complete:!1,completeLabel:`Photo uploaded`,incompleteLabel:`Upload a photo to personalize your profile`,action:(0,l.jsx)(a,{size:`sm`,variant:`outline`,children:`Upload`})},decorators:[e=>(0,l.jsx)(`ul`,{className:`w-96 list-none p-0 m-0`,children:(0,l.jsx)(e,{})})]},f={args:{index:1,title:`Add your profile photo`,complete:!0,completeLabel:`Photo uploaded`,incompleteLabel:`Upload a photo to personalize your profile`},decorators:[e=>(0,l.jsx)(`ul`,{className:`w-96 list-none p-0 m-0`,children:(0,l.jsx)(e,{})})]},p={render:()=>(0,l.jsxs)(`ul`,{className:`w-96 space-y-2 list-none p-0 m-0`,children:[(0,l.jsx)(o,{index:1,title:`Add your profile photo`,complete:!0,completeLabel:`Photo uploaded`,incompleteLabel:`Upload a photo`}),(0,l.jsx)(o,{index:2,title:`Set your display name`,complete:!0,completeLabel:`Name set`,incompleteLabel:`Add your name`}),(0,l.jsx)(o,{index:3,title:`Add your first link`,complete:!1,completeLabel:`Link added`,incompleteLabel:`Add a music or social link`,action:(0,l.jsx)(a,{size:`sm`,variant:`outline`,children:`Add Link`})}),(0,l.jsx)(o,{index:4,title:`Share your profile`,complete:!1,completeLabel:`Profile shared`,incompleteLabel:`Copy and share your profile URL`,action:(0,l.jsx)(a,{size:`sm`,variant:`outline`,children:`Copy URL`})})]})},m=[`Incomplete`,`Complete`,`SetupChecklist`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    index: 1,
    title: 'Add your profile photo',
    complete: false,
    completeLabel: 'Photo uploaded',
    incompleteLabel: 'Upload a photo to personalize your profile',
    action: <Button size='sm' variant='outline'>
        Upload
      </Button>
  },
  decorators: [Story => <ul className='w-96 list-none p-0 m-0'>
        <Story />
      </ul>]
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    index: 1,
    title: 'Add your profile photo',
    complete: true,
    completeLabel: 'Photo uploaded',
    incompleteLabel: 'Upload a photo to personalize your profile'
  },
  decorators: [Story => <ul className='w-96 list-none p-0 m-0'>
        <Story />
      </ul>]
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <ul className='w-96 space-y-2 list-none p-0 m-0'>
      <SetupTaskItem index={1} title='Add your profile photo' complete={true} completeLabel='Photo uploaded' incompleteLabel='Upload a photo' />
      <SetupTaskItem index={2} title='Set your display name' complete={true} completeLabel='Name set' incompleteLabel='Add your name' />
      <SetupTaskItem index={3} title='Add your first link' complete={false} completeLabel='Link added' incompleteLabel='Add a music or social link' action={<Button size='sm' variant='outline'>
            Add Link
          </Button>} />
      <SetupTaskItem index={4} title='Share your profile' complete={false} completeLabel='Profile shared' incompleteLabel='Copy and share your profile URL' action={<Button size='sm' variant='outline'>
            Copy URL
          </Button>} />
    </ul>
}`,...p.parameters?.docs?.source}}}})))()}h();export{f as Complete,d as Incomplete,p as SetupChecklist,m as __namedExportsOrder,u as default};