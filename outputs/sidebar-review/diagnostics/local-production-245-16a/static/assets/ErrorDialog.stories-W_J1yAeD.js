import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";import{o as a,r as o}from"./dialog-D3PBJ2jy.js";import{i as s,n as c,r as l,t as u}from"./Dialog-BDOx20rK.js";import{n as d,t as f}from"./ErrorDetails-Dj9vo9Je.js";function p({open:e,title:t,description:n,onClose:r,primaryActionLabel:i,onPrimaryAction:s,secondaryActionLabel:d,onSecondaryAction:p,error:h}){return(0,m.jsx)(u,{open:e,onClose:r,className:`bg-white p-6 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800`,children:(0,m.jsxs)(`div`,{className:`space-y-4`,"data-testid":`app-error-dialog`,children:[(0,m.jsx)(a,{children:t}),(0,m.jsx)(o,{children:n}),(0,m.jsxs)(l,{children:[(0,m.jsx)(`p`,{className:`text-sm text-zinc-600 dark:text-zinc-300`,children:`Something went wrong while processing your request. You can retry the last action or close this dialog to continue where you left off.`}),(0,m.jsx)(`div`,{className:`mt-4`,children:(0,m.jsx)(f,{error:h,extraContext:{Title:t,Description:n}})})]}),(0,m.jsxs)(c,{children:[d?(0,m.jsx)(`button`,{type:`button`,onClick:p??r,className:`inline-flex items-center justify-center rounded-md border border-subtle px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800`,children:d}):null,(0,m.jsx)(`button`,{type:`button`,onClick:s??r,className:`inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-900 dark:bg-white dark:text-black`,"data-testid":`error-dialog-primary-action`,children:i??`Retry`})]})]})})}var m;function h(){return(h=e((()=>{m=n(),s(),d()})))()}var g,_,v,y,b,x,S,C;function w(){return(w=e((()=>{g=n(),r(),_=t(),h(),v={title:`Feedback/ErrorDialog`,component:p,parameters:{layout:`centered`}},y={args:{open:!0,title:`Failed to save changes`,description:`An error occurred while saving your profile.`,onClose:()=>console.log(`Close`),primaryActionLabel:`Retry`,onPrimaryAction:()=>console.log(`Retry`)}},b={args:{open:!0,title:`Network Error`,description:`Unable to connect to the server.`,onClose:()=>console.log(`Close`),primaryActionLabel:`Retry`,onPrimaryAction:()=>console.log(`Retry`),secondaryActionLabel:`Cancel`,onSecondaryAction:()=>console.log(`Cancel`)}},x={args:{open:!0,title:`Session Expired`,description:`Your session has expired. Please sign in again.`,onClose:()=>console.log(`Close`),primaryActionLabel:`Sign In`,onPrimaryAction:()=>console.log(`Sign In`)}},S={render:function(){let[e,t]=(0,_.useState)(!1);return(0,g.jsxs)(`div`,{className:`space-y-4`,children:[(0,g.jsx)(i,{onClick:()=>t(!0),children:`Trigger Error`}),(0,g.jsx)(p,{open:e,title:`Something went wrong`,description:`We encountered an unexpected error.`,onClose:()=>t(!1),primaryActionLabel:`Try Again`,onPrimaryAction:()=>t(!1),secondaryActionLabel:`Dismiss`,onSecondaryAction:()=>t(!1)})]})}},C=[`Default`,`WithSecondaryAction`,`SessionExpired`,`Interactive`],y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    title: 'Failed to save changes',
    description: 'An error occurred while saving your profile.',
    onClose: () => console.log('Close'),
    primaryActionLabel: 'Retry',
    onPrimaryAction: () => console.log('Retry')
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    title: 'Network Error',
    description: 'Unable to connect to the server.',
    onClose: () => console.log('Close'),
    primaryActionLabel: 'Retry',
    onPrimaryAction: () => console.log('Retry'),
    secondaryActionLabel: 'Cancel',
    onSecondaryAction: () => console.log('Cancel')
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again.',
    onClose: () => console.log('Close'),
    primaryActionLabel: 'Sign In',
    onPrimaryAction: () => console.log('Sign In')
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: function InteractiveErrorDialog() {
    const [open, setOpen] = useState(false);
    return <div className='space-y-4'>
        <Button onClick={() => setOpen(true)}>Trigger Error</Button>
        <ErrorDialog open={open} title='Something went wrong' description='We encountered an unexpected error.' onClose={() => setOpen(false)} primaryActionLabel='Try Again' onPrimaryAction={() => setOpen(false)} secondaryActionLabel='Dismiss' onSecondaryAction={() => setOpen(false)} />
      </div>;
  }
}`,...S.parameters?.docs?.source}}}})))()}w();export{y as Default,S as Interactive,x as SessionExpired,b as WithSecondaryAction,C as __namedExportsOrder,v as default};