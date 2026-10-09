import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./ErrorBanner-qGlKWRZV.js";var a,o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x;function S(){return(S=e((()=>{a=n(),o=t(),r(),{fn:s}=__STORYBOOK_MODULE_TEST__,c={title:`Feedback/ErrorBanner`,component:i,parameters:{layout:`centered`}},l={args:{title:`Something went wrong`,className:`w-96`}},u={args:{title:`Failed to save changes`,description:`Please check your connection and try again.`,className:`w-96`}},d={args:{title:`Session expired`,description:`Your session has expired. Please sign in again to continue.`,actions:[{label:`Sign In`,href:`/signin`}],className:`w-96`}},f={args:{title:`Failed to load profile`,description:`We encountered an error while loading your profile data.`,actions:[{label:`Retry`,onClick:()=>console.log(`Retry clicked`)},{label:`Contact Support`,href:`/support`}],className:`w-96`}},p={args:{title:`Network connection lost`,description:`Please check your internet connection and try again.`,actions:[{label:`Retry`,onClick:()=>console.log(`Retry`)}],className:`w-96`}},m={args:{title:`Invalid form data`,description:`Please correct the errors below and submit again.`,className:`w-96`}},h={render:()=>(0,a.jsxs)(`div`,{className:`w-96 space-y-4 p-6 border border-subtle rounded-xl bg-surface`,children:[(0,a.jsx)(`h2`,{className:`text-lg font-semibold`,children:`Profile Settings`}),(0,a.jsx)(i,{title:`Failed to update profile`,description:`Your changes could not be saved. Please try again.`,actions:[{label:`Retry`,onClick:()=>{}}]}),(0,a.jsxs)(`div`,{className:`space-y-2`,children:[(0,a.jsx)(`label`,{className:`text-sm font-medium`,children:`Display Name`}),(0,a.jsx)(`input`,{type:`text`,className:`w-full px-3 py-2 border border-subtle rounded-lg`,defaultValue:`John Doe`})]})]})},g={args:{title:`Something went wrong`,description:`Please check your connection and try again.`,actions:[{label:`Try again`,onClick:s()}],onDismiss:s(),className:`w-96`}},_={args:{title:`Something went wrong`,onDismiss:s(),className:`w-96`}},v={args:{title:`Failed to save changes`,description:`Please check your connection and try again.`,onDismiss:s(),className:`w-96`}},y={args:{title:`Failed to load profile`,description:`We encountered an error while loading your profile data.`,actions:[{label:`Retry`,onClick:s()},{label:`Contact Support`,href:`/support`}],onDismiss:s(),className:`w-96`}},b={render:function(){let[e,t]=(0,o.useState)(!0);return e?(0,a.jsx)(i,{title:`Session expired`,description:`Your session has expired. Please sign in again to continue.`,actions:[{label:`Sign In`,href:`/signin`}],onDismiss:()=>t(!1),className:`w-96`}):(0,a.jsxs)(`div`,{className:`w-96 p-4 text-center text-muted-foreground`,children:[(0,a.jsx)(`p`,{className:`mb-4`,children:`Banner dismissed!`}),(0,a.jsx)(`button`,{type:`button`,onClick:()=>t(!0),className:`text-sm text-primary underline hover:no-underline`,children:`Show again`})]})}},x=[`Default`,`WithDescription`,`WithSingleAction`,`WithMultipleActions`,`NetworkError`,`ValidationError`,`InContext`,`CanonicalTokens`,`Dismissible`,`DismissibleWithDescription`,`DismissibleWithActions`,`InteractiveDismiss`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Something went wrong',
    className: 'w-96'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Failed to save changes',
    description: 'Please check your connection and try again.',
    className: 'w-96'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Session expired',
    description: 'Your session has expired. Please sign in again to continue.',
    actions: [{
      label: 'Sign In',
      href: '/signin'
    }],
    className: 'w-96'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Failed to load profile',
    description: 'We encountered an error while loading your profile data.',
    actions: [{
      label: 'Retry',
      onClick: () => console.log('Retry clicked')
    }, {
      label: 'Contact Support',
      href: '/support'
    }],
    className: 'w-96'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Network connection lost',
    description: 'Please check your internet connection and try again.',
    actions: [{
      label: 'Retry',
      onClick: () => console.log('Retry')
    }],
    className: 'w-96'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Invalid form data',
    description: 'Please correct the errors below and submit again.',
    className: 'w-96'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-96 space-y-4 p-6 border border-subtle rounded-xl bg-surface'>
      <h2 className='text-lg font-semibold'>Profile Settings</h2>
      <ErrorBanner title='Failed to update profile' description='Your changes could not be saved. Please try again.' actions={[{
      label: 'Retry',
      onClick: () => {}
    }]} />
      <div className='space-y-2'>
        {
      // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
      <label className='text-sm font-medium'>Display Name</label>}
        <input type='text' className='w-full px-3 py-2 border border-subtle rounded-lg' defaultValue='John Doe' />
      </div>
    </div>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Something went wrong',
    description: 'Please check your connection and try again.',
    actions: [{
      label: 'Try again',
      onClick: fn()
    }],
    onDismiss: fn(),
    className: 'w-96'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Something went wrong',
    onDismiss: fn(),
    className: 'w-96'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Failed to save changes',
    description: 'Please check your connection and try again.',
    onDismiss: fn(),
    className: 'w-96'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Failed to load profile',
    description: 'We encountered an error while loading your profile data.',
    actions: [{
      label: 'Retry',
      onClick: fn()
    }, {
      label: 'Contact Support',
      href: '/support'
    }],
    onDismiss: fn(),
    className: 'w-96'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: function InteractiveDismissableBanner() {
    const [visible, setVisible] = useState(true);
    if (!visible) {
      return <div className='w-96 p-4 text-center text-muted-foreground'>
          <p className='mb-4'>Banner dismissed!</p>
          <button type='button' onClick={() => setVisible(true)} className='text-sm text-primary underline hover:no-underline'>
            Show again
          </button>
        </div>;
    }
    return <ErrorBanner title='Session expired' description='Your session has expired. Please sign in again to continue.' actions={[{
      label: 'Sign In',
      href: '/signin'
    }]} onDismiss={() => setVisible(false)} className='w-96' />;
  }
}`,...b.parameters?.docs?.source}}}})))()}S();export{g as CanonicalTokens,l as Default,_ as Dismissible,y as DismissibleWithActions,v as DismissibleWithDescription,h as InContext,b as InteractiveDismiss,p as NetworkError,m as ValidationError,u as WithDescription,f as WithMultipleActions,d as WithSingleAction,x as __namedExportsOrder,c as default};