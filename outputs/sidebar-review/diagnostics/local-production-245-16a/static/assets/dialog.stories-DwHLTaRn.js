import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{a as i,c as a,i as o,n as s,o as c,r as l,s as u,t as d}from"./dialog-D3PBJ2jy.js";var f,p,m,h,g,_,v;function y(){return(y=e((()=>{f=t(),n(),a(),p={title:`UI/Atoms/Dialog`,parameters:{layout:`centered`},tags:[`autodocs`]},m={render:()=>(0,f.jsxs)(d,{defaultOpen:!0,children:[(0,f.jsx)(u,{asChild:!0,children:(0,f.jsx)(r,{children:`Open dialog`})}),(0,f.jsxs)(s,{children:[(0,f.jsxs)(i,{children:[(0,f.jsx)(c,{children:`Edit profile`}),(0,f.jsx)(l,{children:`Update your public display name.`})]}),(0,f.jsxs)(o,{children:[(0,f.jsx)(r,{variant:`secondary`,children:`Cancel`}),(0,f.jsx)(r,{children:`Save`})]})]})]})},h={render:()=>(0,f.jsx)(d,{defaultOpen:!0,children:(0,f.jsx)(s,{className:`max-w-xs`,children:(0,f.jsxs)(i,{children:[(0,f.jsx)(c,{children:`Narrow container`}),(0,f.jsx)(l,{children:`Long content should wrap without overflow.`})]})})}),parameters:{viewport:{defaultViewport:`mobile1`}}},g={render:()=>(0,f.jsx)(d,{defaultOpen:!0,children:(0,f.jsxs)(s,{children:[(0,f.jsxs)(i,{children:[(0,f.jsx)(c,{children:`Review profile changes`}),(0,f.jsx)(l,{children:`The panel remains inside the viewport while long content scrolls.`})]}),(0,f.jsx)(`div`,{className:`grid gap-3`,children:[`Identity`,`Links`,`Audience`,`Territories`,`Sources`].map(e=>(0,f.jsxs)(`div`,{className:`rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-4`,children:[(0,f.jsx)(`p`,{className:`text-sm font-medium text-primary-token`,children:e}),(0,f.jsxs)(`p`,{className:`mt-1 text-xs text-secondary-token`,children:[`Review the current `,e.toLowerCase(),` settings before saving.`]})]},e))}),(0,f.jsxs)(o,{children:[(0,f.jsx)(r,{variant:`secondary`,children:`Cancel`}),(0,f.jsx)(r,{children:`Save changes`})]})]})}),parameters:{viewport:{defaultViewport:`mobile1`}}},_={render:()=>(0,f.jsx)(d,{defaultOpen:!0,children:(0,f.jsxs)(s,{variant:`fullscreen`,children:[(0,f.jsx)(c,{children:`Workspace search`}),(0,f.jsx)(l,{children:`Full-screen search takeover.`})]})})},v=[`Default`,`Narrow`,`ScrollContained`,`Fullscreen`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update your public display name.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='secondary'>Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <Dialog defaultOpen>
      <DialogContent className='max-w-xs'>
        <DialogHeader>
          <DialogTitle>Narrow container</DialogTitle>
          <DialogDescription>
            Long content should wrap without overflow.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review profile changes</DialogTitle>
          <DialogDescription>
            The panel remains inside the viewport while long content scrolls.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          {['Identity', 'Links', 'Audience', 'Territories', 'Sources'].map(section => <div key={section} className='rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-4'>
                <p className='text-sm font-medium text-primary-token'>
                  {section}
                </p>
                <p className='mt-1 text-xs text-secondary-token'>
                  Review the current {section.toLowerCase()} settings before
                  saving.
                </p>
              </div>)}
        </div>
        <DialogFooter>
          <Button variant='secondary'>Cancel</Button>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <Dialog defaultOpen>
      <DialogContent variant='fullscreen'>
        <DialogTitle>Workspace search</DialogTitle>
        <DialogDescription>Full-screen search takeover.</DialogDescription>
      </DialogContent>
    </Dialog>
}`,..._.parameters?.docs?.source}}}})))()}y();export{m as Default,_ as Fullscreen,h as Narrow,g as ScrollContained,v as __namedExportsOrder,p as default};