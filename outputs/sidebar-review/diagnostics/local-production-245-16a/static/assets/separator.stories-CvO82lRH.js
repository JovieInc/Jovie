import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./react-CFeKwT_a.js";import{t as r}from"./jsx-runtime-BbDfbRii.js";import{n as i,t as a}from"./utils-CTJK0RKy.js";import{n as o,t as s}from"./dist-GsJhdOEU.js";function c(e){return h.includes(e)}var l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{l=t(n(),1),o(),u=r(),d=Object.defineProperty,f=(e,t)=>d(e,`name`,{value:t,configurable:!0}),p={Horizontal:`horizontal`,Vertical:`vertical`},m=p.Horizontal,h=Object.values(p),g=l.forwardRef(f(function(e,t){let{decorative:n,orientation:r=m,...i}=e,a=c(r)?r:m,o=a===p.Vertical?a:void 0,l=n?{role:`none`}:{"aria-orientation":o,role:`separator`};return(0,u.jsx)(s.div,{"data-orientation":a,...l,...i,ref:t})},`Separator`)),f(c,`isValidOrientation`)})))()}var v,y,b;function x(){return(x=e((()=>{v=r(),_(),y=t(n()),i(),b=y.forwardRef(({className:e,orientation:t=`horizontal`,decorative:n=!0,...r},i)=>(0,v.jsx)(g,{ref:i,"data-slot":`separator`,decorative:n,orientation:t,className:a(`shrink-0 bg-subtle`,t===`horizontal`?`h-px w-full`:`h-full w-px`,e),...r})),b.displayName=g.displayName})))()}function S(e){let t=e.trim().toLowerCase();if(t===`transparent`)return!1;let n=t.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/);if(n)return Number(n[1])>0;let r=t.match(/\/\s*([0-9.]+)\s*(%)?\s*\)$/);if(r){let e=Number(r[1]);return(r[2]?e/100:e)>0}return!/\/\s*none\s*\)$/.test(t)}var C,w,T,E,D,O,k,A,j;function M(){return(M=e((()=>{C=r(),x(),{expect:w,waitFor:T}=__STORYBOOK_MODULE_TEST__,E={title:`UI/Atoms/Separator`,component:b,parameters:{layout:`centered`},tags:[`autodocs`]},D={render:()=>(0,C.jsxs)(`div`,{className:`w-48 space-y-2`,children:[(0,C.jsx)(`div`,{children:`Above`}),(0,C.jsx)(b,{}),(0,C.jsx)(`div`,{children:`Below`})]})},O={render:()=>(0,C.jsxs)(`div`,{className:`flex h-12 items-center gap-2`,children:[(0,C.jsx)(`span`,{children:`Left`}),(0,C.jsx)(b,{orientation:`vertical`}),(0,C.jsx)(`span`,{children:`Right`})]})},k={render:()=>(0,C.jsxs)(`div`,{className:`w-64 space-y-3 text-sm text-secondary-token`,children:[(0,C.jsx)(`p`,{children:`Audience overview`}),(0,C.jsx)(b,{decorative:!1}),(0,C.jsx)(`p`,{children:`Traffic sources`})]})},A={render:()=>(0,C.jsxs)(`div`,{className:`grid gap-4`,"data-testid":`separator-conformance`,style:{width:`min(20rem, calc(100vw - 2rem))`},children:[(0,C.jsxs)(`section`,{className:`rounded-xl bg-surface-0 p-4 text-primary-token`,children:[(0,C.jsx)(`p`,{className:`mb-3 text-sm font-medium`,children:`Horizontal sections`}),(0,C.jsxs)(`div`,{className:`grid gap-3`,"data-testid":`separator-horizontal-region`,children:[(0,C.jsx)(`p`,{className:`text-sm`,children:`Audience overview`}),(0,C.jsx)(b,{"data-testid":`separator-horizontal-decorative`}),(0,C.jsx)(`p`,{className:`text-sm`,children:`Traffic sources`}),(0,C.jsx)(b,{"data-testid":`separator-horizontal-semantic`,decorative:!1}),(0,C.jsx)(`p`,{className:`text-sm`,children:`Release activity`})]})]}),(0,C.jsxs)(`section`,{className:`rounded-xl bg-surface-0 p-4 text-primary-token`,children:[(0,C.jsx)(`p`,{className:`mb-3 text-sm font-medium`,children:`Vertical groups`}),(0,C.jsxs)(`div`,{className:`flex h-12 items-center gap-3`,"data-testid":`separator-vertical-region`,children:[(0,C.jsx)(`span`,{className:`text-sm`,children:`Left`}),(0,C.jsx)(b,{"data-testid":`separator-vertical-decorative`,orientation:`vertical`}),(0,C.jsx)(b,{"data-testid":`separator-vertical-semantic`,decorative:!1,orientation:`vertical`}),(0,C.jsx)(`span`,{className:`text-sm`,children:`Right`})]})]})]}),play:async({canvasElement:e})=>{let t=e.querySelector(`[data-testid="separator-conformance"]`);if(await T(()=>w(t).toBeInTheDocument()),!t)return;let n=t.querySelector(`[data-testid="separator-horizontal-decorative"]`),r=t.querySelector(`[data-testid="separator-horizontal-semantic"]`),i=t.querySelector(`[data-testid="separator-vertical-decorative"]`),a=t.querySelector(`[data-testid="separator-vertical-semantic"]`),o=document.createElement(`span`);o.setAttribute(`aria-hidden`,`true`),o.style.backgroundColor=`var(--color-border-subtle)`,o.style.height=`1px`,o.style.position=`fixed`,o.style.visibility=`hidden`,o.style.width=`1px`,t.append(o);let s=getComputedStyle(o).backgroundColor;o.remove(),await w(s).not.toBe(``),await w(S(s)).toBe(!0);for(let e of[n,r,i,a]){if(await w(e).toBeInTheDocument(),!e)return;let t=getComputedStyle(e).backgroundColor;await w(S(t)).toBe(!0),await w(t).toBe(s),await w(e).toHaveAttribute(`data-slot`,`separator`)}await w(n).toHaveAttribute(`role`,`none`),await w(r).toHaveAttribute(`role`,`separator`),await w(r).not.toHaveAttribute(`aria-orientation`),await w(i).toHaveAttribute(`role`,`none`),await w(a).toHaveAttribute(`role`,`separator`),await w(a).toHaveAttribute(`aria-orientation`,`vertical`);let c=n?.getBoundingClientRect(),l=i?.getBoundingClientRect();await w(c?.width??0).toBeGreaterThan(0),await w(c?.height??0).toBeGreaterThan(0),await w(c?.height??0).toBeLessThanOrEqual(2),await w(l?.width??0).toBeGreaterThan(0),await w(l?.width??0).toBeLessThanOrEqual(2),await w(l?.height??0).toBeGreaterThan(0),await w(t.scrollWidth).toBeLessThanOrEqual(t.clientWidth+1)},parameters:{docs:{description:{story:`Canonical Separator proof: horizontal and vertical orientations, decorative and semantic accessibility modes, tokenized paint, responsive geometry, and no horizontal overflow.`}}}},j=[`Horizontal`,`Vertical`,`SemanticSections`,`ConformanceMatrix`],D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-48 space-y-2'>
      <div>Above</div>
      <Separator />
      <div>Below</div>
    </div>
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex h-12 items-center gap-2'>
      <span>Left</span>
      <Separator orientation='vertical' />
      <span>Right</span>
    </div>
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-64 space-y-3 text-sm text-secondary-token'>
      <p>Audience overview</p>
      <Separator decorative={false} />
      <p>Traffic sources</p>
    </div>
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-4' data-testid='separator-conformance' style={{
    width: 'min(20rem, calc(100vw - 2rem))'
  }}>
      <section className='rounded-xl bg-surface-0 p-4 text-primary-token'>
        <p className='mb-3 text-sm font-medium'>Horizontal sections</p>
        <div className='grid gap-3' data-testid='separator-horizontal-region'>
          <p className='text-sm'>Audience overview</p>
          <Separator data-testid='separator-horizontal-decorative' />
          <p className='text-sm'>Traffic sources</p>
          <Separator data-testid='separator-horizontal-semantic' decorative={false} />
          <p className='text-sm'>Release activity</p>
        </div>
      </section>

      <section className='rounded-xl bg-surface-0 p-4 text-primary-token'>
        <p className='mb-3 text-sm font-medium'>Vertical groups</p>
        <div className='flex h-12 items-center gap-3' data-testid='separator-vertical-region'>
          <span className='text-sm'>Left</span>
          <Separator data-testid='separator-vertical-decorative' orientation='vertical' />
          <Separator data-testid='separator-vertical-semantic' decorative={false} orientation='vertical' />
          <span className='text-sm'>Right</span>
        </div>
      </section>
    </div>,
  play: async ({
    canvasElement
  }) => {
    const root = canvasElement.querySelector<HTMLElement>('[data-testid="separator-conformance"]');
    await waitFor(() => expect(root).toBeInTheDocument());
    if (!root) return;
    const horizontalDecorative = root.querySelector<HTMLElement>('[data-testid="separator-horizontal-decorative"]');
    const horizontalSemantic = root.querySelector<HTMLElement>('[data-testid="separator-horizontal-semantic"]');
    const verticalDecorative = root.querySelector<HTMLElement>('[data-testid="separator-vertical-decorative"]');
    const verticalSemantic = root.querySelector<HTMLElement>('[data-testid="separator-vertical-semantic"]');
    const tokenProbe = document.createElement('span');
    tokenProbe.setAttribute('aria-hidden', 'true');
    tokenProbe.style.backgroundColor = 'var(--color-border-subtle)';
    tokenProbe.style.height = '1px';
    tokenProbe.style.position = 'fixed';
    tokenProbe.style.visibility = 'hidden';
    tokenProbe.style.width = '1px';
    root.append(tokenProbe);
    const tokenPaint = getComputedStyle(tokenProbe).backgroundColor;
    tokenProbe.remove();
    await expect(tokenPaint).not.toBe('');
    await expect(hasVisiblePaintAlpha(tokenPaint)).toBe(true);
    for (const separator of [horizontalDecorative, horizontalSemantic, verticalDecorative, verticalSemantic]) {
      await expect(separator).toBeInTheDocument();
      if (!separator) return;
      const backgroundColor = getComputedStyle(separator).backgroundColor;
      await expect(hasVisiblePaintAlpha(backgroundColor)).toBe(true);
      await expect(backgroundColor).toBe(tokenPaint);
      await expect(separator).toHaveAttribute('data-slot', 'separator');
    }
    await expect(horizontalDecorative).toHaveAttribute('role', 'none');
    await expect(horizontalSemantic).toHaveAttribute('role', 'separator');
    await expect(horizontalSemantic).not.toHaveAttribute('aria-orientation');
    await expect(verticalDecorative).toHaveAttribute('role', 'none');
    await expect(verticalSemantic).toHaveAttribute('role', 'separator');
    await expect(verticalSemantic).toHaveAttribute('aria-orientation', 'vertical');
    const horizontalBox = horizontalDecorative?.getBoundingClientRect();
    const verticalBox = verticalDecorative?.getBoundingClientRect();
    await expect(horizontalBox?.width ?? 0).toBeGreaterThan(0);
    await expect(horizontalBox?.height ?? 0).toBeGreaterThan(0);
    await expect(horizontalBox?.height ?? 0).toBeLessThanOrEqual(2);
    await expect(verticalBox?.width ?? 0).toBeGreaterThan(0);
    await expect(verticalBox?.width ?? 0).toBeLessThanOrEqual(2);
    await expect(verticalBox?.height ?? 0).toBeGreaterThan(0);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
  parameters: {
    docs: {
      description: {
        story: 'Canonical Separator proof: horizontal and vertical orientations, decorative and semantic accessibility modes, tokenized paint, responsive geometry, and no horizontal overflow.'
      }
    }
  }
}`,...A.parameters?.docs?.source}}}})))()}M();export{A as ConformanceMatrix,D as Horizontal,k as SemanticSections,O as Vertical,j as __namedExportsOrder,E as default};