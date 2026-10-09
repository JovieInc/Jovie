import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";import{a as ee,c as a,i as te,l as ne,n as re,o as ie,r as o,s,t as c,u as ae}from"./alert-dialog-DEh0LEnC.js";import{a as l,c as oe,n as u,o as d,r as f,s as p,t as m}from"./dialog-D3PBJ2jy.js";import{c as h,d as g,f as se,l as _,n as v,r as y,t as b,u as x}from"./dropdown-menu-Y42T2GdN.js";import{a as S,i as C,n as ce,o as le,t as w}from"./popover-BXx8dM3W.js";import{a as T,i as E,n as D,o as O,r as k,t as A}from"./select-DVI0eVz3.js";import{c as j,i as M,l as N,o as P,r as F,s as I,t as L}from"./sheet-bREDym29.js";function R({testId:e}){return(0,H.jsxs)(A,{defaultValue:`Apple`,children:[(0,H.jsx)(E,{"data-testid":`${e}-trigger`,"aria-label":`Fruit`,children:(0,H.jsx)(T,{})}),(0,H.jsx)(D,{"data-testid":`${e}-content`,children:G.map(e=>(0,H.jsx)(k,{value:e,children:e},e))})]})}function z(){let[e,t]=(0,U.useState)(!1);return(0,H.jsxs)(`div`,{className:`p-6`,children:[(0,H.jsxs)(b,{children:[(0,H.jsx)(g,{asChild:!0,children:(0,H.jsx)(i,{"data-testid":`menu-trigger`,children:`Actions`})}),(0,H.jsxs)(v,{"data-testid":`menu-content`,children:[(0,H.jsx)(y,{"data-testid":`menu-item-rename`,onSelect:()=>t(!0),children:`Rename…`}),(0,H.jsx)(y,{children:`Duplicate`})]})]}),(0,H.jsx)(m,{open:e,onOpenChange:t,children:(0,H.jsxs)(u,{"data-testid":`dialog-content`,children:[(0,H.jsxs)(l,{children:[(0,H.jsx)(d,{children:`Rename release`}),(0,H.jsx)(f,{children:`Names show on every link.`})]}),(0,H.jsx)(`input`,{"aria-label":`Release name`,"data-testid":`dialog-input`,className:`rounded border border-default px-2 py-1`,defaultValue:`Midnight`}),(0,H.jsx)(R,{testId:`dialog-select`}),(0,H.jsxs)(w,{children:[(0,H.jsx)(S,{asChild:!0,children:(0,H.jsx)(i,{variant:`secondary`,"data-testid":`dialog-popover-trigger`,children:`Naming tips`})}),(0,H.jsx)(C,{"data-testid":`dialog-popover-content`,children:(0,H.jsx)(`p`,{className:`text-sm`,children:`Keep it under 40 characters.`})})]})]})})]})}function B({corner:e}){return(0,H.jsxs)(b,{children:[(0,H.jsx)(g,{asChild:!0,children:(0,H.jsx)(i,{"data-testid":`nested-trigger-${e}`,children:e})}),(0,H.jsxs)(v,{"data-testid":`nested-l1-${e}`,children:[(0,H.jsx)(y,{children:`Level one item`}),(0,H.jsxs)(h,{children:[(0,H.jsx)(x,{"data-testid":`nested-l1-sub-${e}`,children:`Move to`}),(0,H.jsxs)(_,{"data-testid":`nested-l2-${e}`,children:[(0,H.jsx)(y,{children:`Level two item`}),(0,H.jsxs)(h,{children:[(0,H.jsx)(x,{"data-testid":`nested-l2-sub-${e}`,children:`Playlist`}),(0,H.jsxs)(_,{"data-testid":`nested-l3-${e}`,children:[(0,H.jsx)(y,{"data-testid":`nested-l3-item-${e}`,children:`Late night drives with a long playlist name`}),(0,H.jsx)(y,{children:`Morning run`})]})]})]})]})]})]})}function V(){let[e,t]=(0,U.useState)(!0),[n,r]=(0,U.useState)(!1);return(0,H.jsxs)(`div`,{className:`p-6`,children:[(0,H.jsxs)(w,{open:n,onOpenChange:r,children:[e?(0,H.jsx)(ce,{asChild:!0,children:(0,H.jsx)(i,{"data-testid":`anchor-trigger`,onClick:()=>r(e=>!e),children:`Row actions`})}):null,(0,H.jsx)(C,{"data-testid":`anchor-popover-content`,children:(0,H.jsx)(i,{variant:`secondary`,"data-testid":`anchor-remove`,onClick:()=>t(!1),children:`Remove row`})})]}),(0,H.jsx)(`p`,{"data-testid":`anchor-state`,children:e?`mounted`:`removed`})]})}var H,U,W,G,K,q,J,Y,X,Z,Q;function $(){return($=e((()=>{H=n(),ae(),r(),oe(),se(),le(),O(),N(),U=t(),W={title:`Guardrails/Overlay Collisions`,parameters:{layout:`fullscreen`,docs:{description:{component:`Overlay collision harness.

Composes the canonical @jovie/ui overlay primitives in the combinations
that break in production: a select inside a sheet, a dialog opened from a
dropdown item, a popover inside a dialog, an alert dialog over a sheet,
three-level submenus at every viewport corner, a popover whose anchor
unmounts, and a modal over a scrolling page. The Playwright suite
\`tests/e2e/storybook-overlay-collisions.spec.ts\` drives each story and
asserts the overlay layer contract (topmost hit-testing, Escape order,
focus trap and restore, scroll lock without layout shift, viewport fit).`}}}},G=[`Apple`,`Banana`,`Cherry`,`Damson`,`Elderberry`],K={render:()=>(0,H.jsx)(`div`,{className:`p-6`,children:(0,H.jsxs)(L,{children:[(0,H.jsx)(j,{asChild:!0,children:(0,H.jsx)(i,{"data-testid":`sheet-trigger`,children:`Open sheet`})}),(0,H.jsxs)(F,{side:`right`,"data-testid":`sheet-content`,children:[(0,H.jsxs)(P,{children:[(0,H.jsx)(I,{children:`Rules`}),(0,H.jsx)(M,{children:`Pick a fruit, then delete a rule.`})]}),(0,H.jsx)(R,{testId:`sheet-select`}),(0,H.jsxs)(w,{children:[(0,H.jsx)(S,{asChild:!0,children:(0,H.jsx)(i,{variant:`secondary`,"data-testid":`sheet-popover-trigger`,children:`Rule details`})}),(0,H.jsx)(C,{"data-testid":`sheet-popover-content`,children:(0,H.jsx)(`p`,{className:`text-sm`,children:`Applies to every release.`})})]}),(0,H.jsxs)(c,{children:[(0,H.jsx)(ne,{asChild:!0,children:(0,H.jsx)(i,{variant:`secondary`,"data-testid":`sheet-alert-trigger`,children:`Delete rule`})}),(0,H.jsxs)(te,{"data-testid":`sheet-alert-content`,children:[(0,H.jsxs)(s,{children:[(0,H.jsx)(a,{children:`Delete this rule?`}),(0,H.jsx)(ee,{children:`The rule stops applying immediately.`})]}),(0,H.jsxs)(ie,{children:[(0,H.jsx)(o,{"data-testid":`sheet-alert-cancel`,children:`Cancel`}),(0,H.jsx)(re,{children:`Delete`})]})]})]})]})]})})},q={render:()=>(0,H.jsx)(z,{})},J=[{id:`top-left`,className:`left-2 top-2`},{id:`top-right`,className:`right-2 top-2`},{id:`bottom-left`,className:`bottom-2 left-2`},{id:`bottom-right`,className:`bottom-2 right-2`}],Y={render:()=>(0,H.jsx)(`div`,{className:`relative h-dvh w-full`,children:J.map(e=>(0,H.jsx)(`div`,{className:`absolute ${e.className}`,children:(0,H.jsx)(B,{corner:e.id})},e.id))})},X={render:()=>(0,H.jsx)(V,{})},Z={render:()=>(0,H.jsxs)(`div`,{className:`min-h-[250vh] p-6`,children:[(0,H.jsx)(`div`,{"data-testid":`scroll-lock-marker`,className:`ml-auto h-8 w-32 rounded bg-surface-1`}),(0,H.jsxs)(m,{children:[(0,H.jsx)(p,{asChild:!0,children:(0,H.jsx)(i,{"data-testid":`scroll-lock-trigger`,children:`Open dialog`})}),(0,H.jsx)(u,{"data-testid":`scroll-lock-dialog`,children:(0,H.jsxs)(l,{children:[(0,H.jsx)(d,{children:`Locked page`}),(0,H.jsx)(f,{children:`The page behind must not shift.`})]})})]})]})},Q=[`SheetStack`,`DialogFromDropdown`,`NestedMenusAtEdges`,`PopoverAnchorUnmount`,`ScrollLock`],K.parameters={...K.parameters,docs:{...K.parameters?.docs,source:{originalSource:`{
  render: () => <div className='p-6'>
      <Sheet>
        <SheetTrigger asChild>
          <Button data-testid='sheet-trigger'>Open sheet</Button>
        </SheetTrigger>
        <SheetContent side='right' data-testid='sheet-content'>
          <SheetHeader>
            <SheetTitle>Rules</SheetTitle>
            <SheetDescription>
              Pick a fruit, then delete a rule.
            </SheetDescription>
          </SheetHeader>
          <FruitSelect testId='sheet-select' />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant='secondary' data-testid='sheet-popover-trigger'>
                Rule details
              </Button>
            </PopoverTrigger>
            <PopoverContent data-testid='sheet-popover-content'>
              <p className='text-sm'>Applies to every release.</p>
            </PopoverContent>
          </Popover>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='secondary' data-testid='sheet-alert-trigger'>
                Delete rule
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid='sheet-alert-content'>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
                <AlertDialogDescription>
                  The rule stops applying immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid='sheet-alert-cancel'>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetContent>
      </Sheet>
    </div>
}`,...K.parameters?.docs?.source}}},q.parameters={...q.parameters,docs:{...q.parameters?.docs,source:{originalSource:`{
  render: () => <DialogFromDropdownHarness />
}`,...q.parameters?.docs?.source}}},Y.parameters={...Y.parameters,docs:{...Y.parameters?.docs,source:{originalSource:`{
  render: () => <div className='relative h-dvh w-full'>
      {CORNERS.map(corner => <div key={corner.id} className={\`absolute \${corner.className}\`}>
          <NestedMenu corner={corner.id} />
        </div>)}
    </div>
}`,...Y.parameters?.docs?.source}}},X.parameters={...X.parameters,docs:{...X.parameters?.docs,source:{originalSource:`{
  render: () => <PopoverAnchorUnmountHarness />
}`,...X.parameters?.docs?.source}}},Z.parameters={...Z.parameters,docs:{...Z.parameters?.docs,source:{originalSource:`{
  render: () => <div className='min-h-[250vh] p-6'>
      <div data-testid='scroll-lock-marker' className='ml-auto h-8 w-32 rounded bg-surface-1' />
      <Dialog>
        <DialogTrigger asChild>
          <Button data-testid='scroll-lock-trigger'>Open dialog</Button>
        </DialogTrigger>
        <DialogContent data-testid='scroll-lock-dialog'>
          <DialogHeader>
            <DialogTitle>Locked page</DialogTitle>
            <DialogDescription>
              The page behind must not shift.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
}`,...Z.parameters?.docs?.source}}}})))()}$();export{q as DialogFromDropdown,Y as NestedMenusAtEdges,X as PopoverAnchorUnmount,Z as ScrollLock,K as SheetStack,Q as __namedExportsOrder,W as default};