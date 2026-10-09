import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{a as i,c as a,i as o,l as s,n as c,o as l,r as u,s as d,t as f,u as p}from"./alert-dialog-DEh0LEnC.js";var m,h,g,_,v,y;function b(){return(b=e((()=>{m=t(),p(),n(),h={title:`UI/Atoms/AlertDialog`,parameters:{layout:`centered`},tags:[`autodocs`]},g={render:()=>(0,m.jsxs)(f,{defaultOpen:!0,children:[(0,m.jsx)(s,{asChild:!0,children:(0,m.jsx)(r,{variant:`secondary`,children:`Open`})}),(0,m.jsxs)(o,{children:[(0,m.jsxs)(d,{children:[(0,m.jsx)(a,{children:`Delete track?`}),(0,m.jsx)(i,{children:`This permanently removes the track from your library.`})]}),(0,m.jsxs)(l,{children:[(0,m.jsx)(u,{children:`Cancel`}),(0,m.jsx)(c,{children:`Delete`})]})]})]})},_={render:()=>(0,m.jsx)(f,{defaultOpen:!0,children:(0,m.jsxs)(o,{children:[(0,m.jsxs)(d,{children:[(0,m.jsx)(a,{children:`Confirm a very long destructive action that wraps onto multiple lines`}),(0,m.jsxs)(i,{children:[(0,m.jsx)(`span`,{className:`block`,children:`The release will be removed from Jovie.`}),(0,m.jsx)(`span`,{className:`mt-2 block`,children:`Existing public links will stop working.`}),(0,m.jsx)(`span`,{className:`mt-2 block`,children:`Analytics history will remain available.`})]})]}),(0,m.jsxs)(l,{children:[(0,m.jsx)(u,{children:`Keep`}),(0,m.jsx)(c,{children:`Continue`})]})]})}),parameters:{viewport:{defaultViewport:`mobile1`}}},v={render:()=>(0,m.jsx)(f,{defaultOpen:!0,children:(0,m.jsxs)(o,{children:[(0,m.jsxs)(d,{children:[(0,m.jsx)(a,{children:`Remove collaborator?`}),(0,m.jsx)(i,{children:`Maya will immediately lose access to this workspace.`})]}),(0,m.jsxs)(l,{children:[(0,m.jsx)(u,{children:`Keep access`}),(0,m.jsx)(c,{variant:`destructive`,children:`Remove access`})]})]})})},y=[`Default`,`LongContent`,`Destructive`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button variant='secondary'>Open</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete track?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the track from your library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Confirm a very long destructive action that wraps onto multiple
            lines
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className='block'>
              The release will be removed from Jovie.
            </span>
            <span className='mt-2 block'>
              Existing public links will stop working.
            </span>
            <span className='mt-2 block'>
              Analytics history will remain available.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  render: () => <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove collaborator?</AlertDialogTitle>
          <AlertDialogDescription>
            Maya will immediately lose access to this workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep access</AlertDialogCancel>
          <AlertDialogAction variant='destructive'>
            Remove access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
}`,...v.parameters?.docs?.source}}}})))()}b();export{g as Default,v as Destructive,_ as LongContent,y as __namedExportsOrder,h as default};