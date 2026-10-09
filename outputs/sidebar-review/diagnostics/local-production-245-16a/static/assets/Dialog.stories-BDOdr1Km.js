import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";import{o as a,r as o}from"./dialog-D3PBJ2jy.js";import{i as s,n as c,r as l,t as u}from"./Dialog-BDOx20rK.js";var d,f,p,m,h,g,_,v,y,b;function x(){return(x=e((()=>{d=n(),r(),f=t(),s(),p={title:`Organisms/Dialog`,component:u,parameters:{layout:`centered`},argTypes:{size:{control:`select`,options:[`xs`,`sm`,`md`,`lg`,`xl`,`2xl`,`3xl`,`4xl`,`5xl`]},hideClose:{control:`boolean`,description:`Hide the canonical close control for blocking flows.`}}},m={args:{open:!0,onClose:()=>console.log(`Close`),size:`lg`,children:(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(a,{children:`Dialog Title`}),(0,d.jsx)(o,{children:`This is a description of the dialog content.`}),(0,d.jsx)(l,{children:(0,d.jsx)(`p`,{className:`text-secondary`,children:`This is the main body content of the dialog. You can put any content here.`})}),(0,d.jsxs)(c,{children:[(0,d.jsx)(i,{variant:`outline`,children:`Cancel`}),(0,d.jsx)(i,{variant:`primary`,children:`Confirm`})]})]})}},h={args:{open:!0,onClose:()=>console.log(`Close`),size:`sm`,children:(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(a,{children:`Confirm Action`}),(0,d.jsx)(o,{children:`Are you sure you want to proceed?`}),(0,d.jsxs)(c,{children:[(0,d.jsx)(i,{variant:`outline`,size:`sm`,children:`Cancel`}),(0,d.jsx)(i,{variant:`primary`,size:`sm`,children:`Confirm`})]})]})}},g={args:{open:!0,onClose:()=>console.log(`Close`),size:`2xl`,children:(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(a,{children:`Edit Profile`}),(0,d.jsx)(o,{children:`Update your profile information below.`}),(0,d.jsx)(l,{children:(0,d.jsxs)(`div`,{className:`space-y-4`,children:[(0,d.jsxs)(`div`,{className:`space-y-2`,children:[(0,d.jsx)(`label`,{className:`text-sm font-medium`,children:`Display Name`}),(0,d.jsx)(`input`,{type:`text`,className:`w-full px-3 py-2 border border-subtle rounded-lg`,placeholder:`Your name`})]}),(0,d.jsxs)(`div`,{className:`space-y-2`,children:[(0,d.jsx)(`label`,{className:`text-sm font-medium`,children:`Bio`}),(0,d.jsx)(`textarea`,{className:`w-full px-3 py-2 border border-subtle rounded-lg`,rows:3,placeholder:`Tell us about yourself`})]})]})}),(0,d.jsxs)(c,{children:[(0,d.jsx)(i,{variant:`outline`,children:`Cancel`}),(0,d.jsx)(i,{variant:`primary`,children:`Save Changes`})]})]})}},_={render:function(){let[e,t]=(0,f.useState)(!1);return(0,d.jsxs)(`div`,{children:[(0,d.jsx)(i,{onClick:()=>t(!0),children:`Open Dialog`}),(0,d.jsxs)(u,{open:e,onClose:()=>t(!1),size:`md`,children:[(0,d.jsx)(a,{children:`Interactive Dialog`}),(0,d.jsx)(o,{children:`This dialog can be opened and closed interactively.`}),(0,d.jsx)(l,{children:(0,d.jsx)(`p`,{className:`text-secondary`,children:`Click the buttons below to interact with this dialog.`})}),(0,d.jsxs)(c,{children:[(0,d.jsx)(i,{variant:`outline`,onClick:()=>t(!1),children:`Cancel`}),(0,d.jsx)(i,{variant:`primary`,onClick:()=>t(!1),children:`Confirm`})]})]})]})}},v={args:{open:!0,onClose:()=>console.log(`Close`),size:`sm`,children:(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(a,{children:`Delete Link`}),(0,d.jsx)(o,{children:`Are you sure you want to delete this link? This action cannot be undone.`}),(0,d.jsxs)(c,{children:[(0,d.jsx)(i,{variant:`outline`,children:`Cancel`}),(0,d.jsx)(i,{variant:`destructive`,children:`Delete`})]})]})}},y={args:{open:!0,onClose:()=>console.log(`Close`),size:`sm`,hideClose:!0,children:(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(a,{children:`Finish account setup`}),(0,d.jsx)(o,{children:`Complete this step before returning to your workspace.`}),(0,d.jsx)(l,{children:(0,d.jsx)(`p`,{className:`text-secondary`,children:`Your progress is saved automatically.`})}),(0,d.jsx)(c,{children:(0,d.jsx)(i,{variant:`primary`,children:`Continue`})})]})}},b=[`Default`,`Small`,`Large`,`Interactive`,`DeleteConfirmation`,`BlockingFlow`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'lg',
    children: <>
        <DialogTitle>Dialog Title</DialogTitle>
        <DialogDescription>
          This is a description of the dialog content.
        </DialogDescription>
        <DialogBody>
          <p className='text-secondary'>
            This is the main body content of the dialog. You can put any content
            here.
          </p>
        </DialogBody>
        <DialogActions>
          <Button variant='outline'>Cancel</Button>
          <Button variant='primary'>Confirm</Button>
        </DialogActions>
      </>
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    children: <>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogDescription>Are you sure you want to proceed?</DialogDescription>
        <DialogActions>
          <Button variant='outline' size='sm'>
            Cancel
          </Button>
          <Button variant='primary' size='sm'>
            Confirm
          </Button>
        </DialogActions>
      </>
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: '2xl',
    children: <>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogDescription>
          Update your profile information below.
        </DialogDescription>
        <DialogBody>
          <div className='space-y-4'>
            <div className='space-y-2'>
              {
            // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
            <label className='text-sm font-medium'>Display Name</label>}
              <input type='text' className='w-full px-3 py-2 border border-subtle rounded-lg' placeholder='Your name' />
            </div>
            <div className='space-y-2'>
              {
            // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
            <label className='text-sm font-medium'>Bio</label>}
              <textarea className='w-full px-3 py-2 border border-subtle rounded-lg' rows={3} placeholder='Tell us about yourself' />
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button variant='outline'>Cancel</Button>
          <Button variant='primary'>Save Changes</Button>
        </DialogActions>
      </>
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: function InteractiveDialog() {
    const [open, setOpen] = useState(false);
    return <div>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <Dialog open={open} onClose={() => setOpen(false)} size='md'>
          <DialogTitle>Interactive Dialog</DialogTitle>
          <DialogDescription>
            This dialog can be opened and closed interactively.
          </DialogDescription>
          <DialogBody>
            <p className='text-secondary'>
              Click the buttons below to interact with this dialog.
            </p>
          </DialogBody>
          <DialogActions>
            <Button variant='outline' onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant='primary' onClick={() => setOpen(false)}>
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </div>;
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    children: <>
        <DialogTitle>Delete Link</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this link? This action cannot be
          undone.
        </DialogDescription>
        <DialogActions>
          <Button variant='outline'>Cancel</Button>
          <Button variant='destructive'>Delete</Button>
        </DialogActions>
      </>
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    hideClose: true,
    children: <>
        <DialogTitle>Finish account setup</DialogTitle>
        <DialogDescription>
          Complete this step before returning to your workspace.
        </DialogDescription>
        <DialogBody>
          <p className='text-secondary'>
            Your progress is saved automatically.
          </p>
        </DialogBody>
        <DialogActions>
          <Button variant='primary'>Continue</Button>
        </DialogActions>
      </>
  }
}`,...y.parameters?.docs?.source}}}})))()}x();export{y as BlockingFlow,m as Default,v as DeleteConfirmation,_ as Interactive,g as Large,h as Small,b as __namedExportsOrder,p as default};