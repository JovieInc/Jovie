import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{a as i,c as a,i as o,l as s,n as c,o as l,r as u,s as d,t as f}from"./sheet-bREDym29.js";function p({side:e,disablePortal:t=!1}){let n=`${e[0].toUpperCase()}${e.slice(1)}`;return(0,m.jsx)(`div`,{className:`min-w-0`,"data-testid":`sheet-fixture-${e}`,"data-portal":t?`inline`:`portal`,children:(0,m.jsxs)(f,{children:[(0,m.jsx)(a,{asChild:!0,children:(0,m.jsxs)(r,{"data-testid":`sheet-trigger-${e}`,variant:`secondary`,children:[`Open `,e,` sheet`]})}),(0,m.jsxs)(u,{side:e,disablePortal:t,testId:`sheet-content-${e}`,children:[(0,m.jsxs)(l,{children:[(0,m.jsxs)(d,{children:[n,` sheet`]}),(0,m.jsx)(o,{children:`Review audience details without losing your place.`})]}),(0,m.jsxs)(`div`,{className:`min-w-0 space-y-3`,children:[(0,m.jsx)(`p`,{className:`break-words text-sm leading-relaxed text-secondary-token`,"data-testid":`sheet-body-${e}`,children:`Long labels remain contained at compact widths: https://jov.ie/artist/this-is-a-long-public-profile-slug`}),(0,m.jsxs)(`div`,{className:`grid gap-2`,children:[(0,m.jsx)(`button`,{className:`min-w-0 break-words rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token`,type:`button`,children:`Returning listeners`}),(0,m.jsx)(`button`,{className:`min-w-0 break-words rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token`,type:`button`,children:`New subscribers`})]})]}),(0,m.jsxs)(i,{children:[(0,m.jsx)(c,{asChild:!0,children:(0,m.jsxs)(r,{"data-testid":`sheet-footer-close-${e}`,variant:`secondary`,children:[`Close `,e]})}),(0,m.jsx)(r,{children:`Apply filters`})]})]})]})})}var m,h,g,_,v,y,b,x,S;function C(){return(C=e((()=>{m=t(),n(),s(),{expect:h,waitFor:g}=__STORYBOOK_MODULE_TEST__,_=[`top`,`bottom`,`left`,`right`],v={title:`UI/Atoms/Sheet`,component:f,parameters:{layout:`centered`},tags:[`autodocs`]},y={render:()=>(0,m.jsxs)(f,{defaultOpen:!0,children:[(0,m.jsx)(a,{asChild:!0,children:(0,m.jsx)(r,{variant:`secondary`,children:`Open sheet`})}),(0,m.jsxs)(u,{children:[(0,m.jsxs)(l,{children:[(0,m.jsx)(d,{children:`Filters`}),(0,m.jsx)(o,{children:`Refine your library results.`})]}),(0,m.jsx)(`div`,{className:`grid gap-2`,children:[`All listeners`,`Returning visitors`,`New subscribers`].map(e=>(0,m.jsx)(`button`,{type:`button`,className:`rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token`,children:e},e))}),(0,m.jsxs)(i,{children:[(0,m.jsx)(r,{variant:`secondary`,children:`Reset`}),(0,m.jsx)(r,{children:`Apply filters`})]})]})]})},b={render:()=>(0,m.jsx)(f,{defaultOpen:!0,children:(0,m.jsxs)(u,{side:`left`,children:[(0,m.jsxs)(l,{children:[(0,m.jsx)(d,{children:`Audience details`}),(0,m.jsx)(o,{children:`Side, surface, spacing, and close anatomy stay consistent.`})]}),(0,m.jsx)(`div`,{className:`grid gap-3`,children:[`Germany · 18 visits`,`United States · 12 visits`,`UK · 7 visits`].map(e=>(0,m.jsx)(`div`,{className:`rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-3 text-sm text-secondary-token`,children:e},e))})]})})},x={render:()=>(0,m.jsxs)(`div`,{className:`grid min-w-0 gap-4 rounded-(--system-b-radius-panel) bg-surface-0 p-4 text-primary-token`,"data-testid":`sheet-conformance`,style:{width:`min(26rem, calc(100vw - 2rem))`},children:[(0,m.jsxs)(`div`,{className:`min-w-0 space-y-1`,children:[(0,m.jsx)(`p`,{className:`text-sm font-medium`,children:`Sheet directions`}),(0,m.jsx)(`p`,{className:`break-words text-sm text-secondary-token`,children:`Every edge keeps the same dialog semantics, close affordance, and compact overflow contract.`})]}),(0,m.jsxs)(`div`,{className:`grid min-w-0 grid-cols-2 gap-2`,children:[(0,m.jsx)(p,{side:`top`,disablePortal:!0}),(0,m.jsx)(p,{side:`bottom`}),(0,m.jsx)(p,{side:`left`}),(0,m.jsx)(p,{side:`right`})]})]}),play:async({canvasElement:e})=>{let t=e.querySelector(`[data-testid="sheet-conformance"]`);if(await g(()=>h(t).toBeInTheDocument()),t){for(let e of _){let n=t.querySelector(`[data-testid="sheet-trigger-${e}"]`);await h(n).toBeInTheDocument(),await h(n).toHaveAccessibleName(`Open ${e} sheet`)}await h(t.scrollWidth).toBeLessThanOrEqual(t.clientWidth+1)}},parameters:{docs:{description:{story:`Canonical Sheet proof surface: all four edge variants, one inline and three portaled hosts, named dialog anatomy, close affordances, long content, and compact overflow stability. Controlled state is covered by the existing Controlled Mode unit tests; pointer-path responsiveness is outside this matrix. Pen identity remains source-bound until a canonical save/readback is available.`}}}},S=[`Default`,`LeftRail`,`ConformanceMatrix`],y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  render: () => <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='secondary'>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine your library results.</SheetDescription>
        </SheetHeader>
        <div className='grid gap-2'>
          {['All listeners', 'Returning visitors', 'New subscribers'].map(option => <button key={option} type='button' className='rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token'>
                {option}
              </button>)}
        </div>
        <SheetFooter>
          <Button variant='secondary'>Reset</Button>
          <Button>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: () => <Sheet defaultOpen>
      <SheetContent side='left'>
        <SheetHeader>
          <SheetTitle>Audience details</SheetTitle>
          <SheetDescription>
            Side, surface, spacing, and close anatomy stay consistent.
          </SheetDescription>
        </SheetHeader>
        <div className='grid gap-3'>
          {['Germany · 18 visits', 'United States · 12 visits', 'UK · 7 visits'].map(listener => <div key={listener} className='rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-3 text-sm text-secondary-token'>
              {listener}
            </div>)}
        </div>
      </SheetContent>
    </Sheet>
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid min-w-0 gap-4 rounded-(--system-b-radius-panel) bg-surface-0 p-4 text-primary-token' data-testid='sheet-conformance' style={{
    width: 'min(26rem, calc(100vw - 2rem))'
  }}>
      <div className='min-w-0 space-y-1'>
        <p className='text-sm font-medium'>Sheet directions</p>
        <p className='break-words text-sm text-secondary-token'>
          Every edge keeps the same dialog semantics, close affordance, and
          compact overflow contract.
        </p>
      </div>
      <div className='grid min-w-0 grid-cols-2 gap-2'>
        <SheetConformanceFixture side='top' disablePortal />
        <SheetConformanceFixture side='bottom' />
        <SheetConformanceFixture side='left' />
        <SheetConformanceFixture side='right' />
      </div>
    </div>,
  play: async ({
    canvasElement
  }) => {
    const root = canvasElement.querySelector<HTMLElement>('[data-testid="sheet-conformance"]');
    await waitFor(() => expect(root).toBeInTheDocument());
    if (!root) return;
    for (const side of SHEET_SIDES) {
      const trigger = root.querySelector<HTMLButtonElement>(\`[data-testid="sheet-trigger-\${side}"]\`);
      await expect(trigger).toBeInTheDocument();
      await expect(trigger).toHaveAccessibleName(\`Open \${side} sheet\`);
    }
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
  parameters: {
    docs: {
      description: {
        story: 'Canonical Sheet proof surface: all four edge variants, one inline and three portaled hosts, named dialog anatomy, close affordances, long content, and compact overflow stability. Controlled state is covered by the existing Controlled Mode unit tests; pointer-path responsiveness is outside this matrix. Pen identity remains source-bound until a canonical save/readback is available.'
      }
    }
  }
}`,...x.parameters?.docs?.source}}}})))()}C();export{x as ConformanceMatrix,y as Default,b as LeftRail,S as __namedExportsOrder,v as default};