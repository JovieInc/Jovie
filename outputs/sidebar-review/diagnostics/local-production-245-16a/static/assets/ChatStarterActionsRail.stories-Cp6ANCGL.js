import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./chevron-left-BfjoQV8I.js";import{n as a,t as o}from"./chevron-right-DEG-SFTJ.js";import{r as s,t as c}from"./button-BSHhPV4e.js";import{n as l,t as u}from"./icon-button-ChwKjABM.js";import{i as d,t as f}from"./utils-AN1vFgqV.js";import{n as p,r as m,t as h}from"./starter-actions-B7n_BUNl.js";import{n as g,t as _}from"./ChatActionCard-CryZkgwW.js";function v(e,t){let n=Math.min(t,S),r=Math.max(t-n,0),i=e-Math.floor(n/2),a=Math.min(Math.max(i,0),r);return Array.from({length:n},(e,t)=>a+t)}function y({cards:e,onAct:t,onDismiss:n}){let[r,a]=(0,x.useState)(0),s=Math.max(e.length-1,0),l=Math.min(r,s),d=e[l],p=v(l,e.length);if((0,x.useEffect)(()=>{a(e=>Math.min(e,s))},[s]),!d)return null;let m=e=>{e.key===`ArrowLeft`?(e.preventDefault(),a(e=>Math.max(e-1,0))):e.key===`ArrowRight`?(e.preventDefault(),a(e=>Math.min(e+1,s))):e.key===`Home`?(e.preventDefault(),a(0)):e.key===`End`&&(e.preventDefault(),a(s))};return(0,b.jsxs)(`section`,{"aria-label":`Starter Actions`,"aria-roledescription":`carousel`,className:`group/carousel relative mx-auto w-full max-w-md`,"data-testid":`chat-starter-actions-rail`,children:[(0,b.jsx)(`fieldset`,{"aria-roledescription":`slide`,"aria-label":`${l+1} of ${e.length}: ${d.title}`,className:`m-0 min-w-0 border-0 p-0`,children:(0,b.jsx)(_,{title:d.title,icon:h[d.id].icon,body:d.body,actionLabel:d.actionLabel,ariaLabel:d.title,onAct:()=>t(d),onDismiss:()=>n(d)})}),(0,b.jsx)(`div`,{className:f(`absolute -left-12 top-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-subtle sm:block`,l===0?``:`group-hover/carousel:opacity-100 focus-within:opacity-100`),children:(0,b.jsx)(u,{variant:`secondary`,size:`md`,ariaLabel:`Show Previous Starter Action`,disabled:l===0,onClick:()=>a(e=>Math.max(e-1,0)),children:(0,b.jsx)(i,{strokeWidth:2.75,"aria-hidden":`true`})})}),(0,b.jsx)(`div`,{className:f(`absolute -right-12 top-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-subtle sm:block`,l===s?``:`group-hover/carousel:opacity-100 focus-within:opacity-100`),children:(0,b.jsx)(u,{variant:`secondary`,size:`md`,ariaLabel:`Show Next Starter Action`,disabled:l===s,onClick:()=>a(e=>Math.min(e+1,s)),children:(0,b.jsx)(o,{strokeWidth:2.75,"aria-hidden":`true`})})}),e.length>1?(0,b.jsxs)(b.Fragment,{children:[(0,b.jsxs)(`div`,{className:`mt-2 flex min-h-11 items-center justify-between gap-3 sm:hidden`,children:[(0,b.jsxs)(`span`,{className:`text-xs tabular-nums text-tertiary-token`,"aria-live":`polite`,children:[l+1,` of `,e.length]}),(0,b.jsxs)(c,{type:`button`,variant:`tertiary`,size:`sm`,"aria-label":`Show More Starter Actions`,onClick:()=>a(e=>e>=s?0:e+1),children:[`More`,(0,b.jsx)(o,{className:`size-4`,"aria-hidden":`true`})]})]}),(0,b.jsxs)(`fieldset`,{className:`mt-2 hidden min-h-5 items-center justify-center border-0 p-0 sm:flex`,children:[(0,b.jsx)(`legend`,{className:`sr-only`,children:`Choose Starter Action`}),p.map(t=>(0,b.jsx)(u,{type:`button`,variant:`ghost`,size:`md`,"aria-label":`Show Starter Action ${t+1} Of ${e.length}: ${e[t]?.title??``}`,"aria-current":t===l?`true`:void 0,onClick:()=>a(t),onKeyDown:m,className:`group`,children:(0,b.jsx)(`span`,{className:f(`size-1 rounded-full transition duration-subtle motion-reduce:transition-none`,t===l?`scale-125 bg-secondary-token`:`bg-quaternary-token/65 group-hover:bg-tertiary-token`),"aria-hidden":`true`})},e[t]?.id??t)),(0,b.jsxs)(`span`,{className:`sr-only`,"aria-live":`polite`,children:[`Starter Action `,l+1,` Of `,e.length]})]})]}):null]})}var b,x,S;function C(){return(C=e((()=>{b=n(),s(),l(),r(),a(),x=t(),d(),m(),g(),S=3})))()}function w(e){let[t,n]=(0,E.useState)(e.cards);return(0,T.jsx)(y,{...e,cards:t,onDismiss:t=>{e.onDismiss(t),n(e=>e.filter(e=>e.id!==t.id))}})}var T,E,D,O,k,A,j,M,N,P,F,I;function L(){return(L=e((()=>{T=n(),E=t(),m(),C(),{expect:D,fn:O,userEvent:k,within:A}=__STORYBOOK_MODULE_TEST__,j=p.map(e=>{let t=h[e];return{id:e,title:t.label,body:t.description,actionLabel:t.actionLabel,prompt:t.prompt}}),M={title:`Jovie/Components/ChatStarterActionsRail`,component:y,parameters:{layout:`centered`,backgrounds:{default:`dark`}},decorators:[e=>(0,T.jsx)(`div`,{className:`mx-auto w-full max-w-xl px-12 py-4`,children:(0,T.jsx)(e,{})})],args:{cards:j,onAct:O(),onDismiss:O()}},N={render:e=>(0,T.jsx)(w,{...e}),play:async({args:e,canvasElement:t})=>{let n=A(t),r=j[0];await k.click(n.getByRole(`button`,{name:r.title})),await D(e.onAct).toHaveBeenCalledWith(r),await k.click(n.getByRole(`button`,{name:`Dismiss ${r.title}`})),await D(e.onDismiss).toHaveBeenCalledWith(r),await D(n.getByRole(`group`,{name:`1 of 3: ${j[1].title}`})).toBeVisible()}},P={args:{cards:j.slice(0,1)},play:async({canvasElement:e})=>{let t=A(e);for(let e of[`Show Previous Starter Action`,`Show Next Starter Action`])await D(t.getByLabelText(e)).toHaveAttribute(`disabled`)}},F={args:{cards:[]}},I=[`AllStarters`,`SingleStarter`,`Empty`],N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  render: args => <DismissibleRail {...args} />,
  play: async ({
    args,
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const first = cards[0]!;
    await userEvent.click(canvas.getByRole('button', {
      name: first.title
    }));
    await expect(args.onAct).toHaveBeenCalledWith(first);
    await userEvent.click(canvas.getByRole('button', {
      name: \`Dismiss \${first.title}\`
    }));
    await expect(args.onDismiss).toHaveBeenCalledWith(first);
    await expect(canvas.getByRole('group', {
      name: \`1 of 3: \${cards[1]!.title}\`
    })).toBeVisible();
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    cards: cards.slice(0, 1)
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    for (const name of ['Show Previous Starter Action', 'Show Next Starter Action']) {
      await expect(canvas.getByLabelText(name)).toHaveAttribute('disabled');
    }
  }
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  args: {
    cards: []
  }
}`,...F.parameters?.docs?.source}}}})))()}L();export{N as AllStarters,F as Empty,P as SingleStarter,I as __namedExportsOrder,M as default};