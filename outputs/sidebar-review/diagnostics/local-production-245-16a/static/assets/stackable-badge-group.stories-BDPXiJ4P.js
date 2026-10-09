import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./utils-CTJK0RKy.js";import{r as i,t as a}from"./button-BSHhPV4e.js";import{n as o,r as s}from"./badge-DqMNX1OQ.js";import{a as c,i as l,o as u,t as d}from"./popover-BXx8dM3W.js";function f({items:e,maxVisible:t=3,density:n=`dense`,width:i=`compact`,ariaLabel:o,className:s,...u}){if(e.length===0)return null;let f=e.slice(0,m(t)),g=Math.max(0,e.length-f.length),_=f[0],v=e.map(e=>e.label.trim()).filter(Boolean).join(`, `),y=o?.trim()||v||`Badges`;return(0,p.jsxs)(`fieldset`,{"aria-label":y,className:r(`group/badge-stack m-0 inline-flex h-5 max-w-full min-w-0 items-center overflow-visible border-0 p-0`,i===`compact`?`w-32`:`w-40`,n===`standard`&&`h-6`,s),"data-slot":`stackable-badge-group`,"data-density":n,"data-width":i,...u,children:[(0,p.jsxs)(`span`,{className:r(h(_),`min-w-0 max-w-32 flex-1 gap-1 px-1.5`,n===`standard`&&`h-6`),title:_.label,"data-selected":_.selected||void 0,"data-disabled":_.disabled||void 0,children:[_.icon&&(0,p.jsx)(`span`,{"aria-hidden":`true`,className:`grid shrink-0 place-items-center`,children:_.icon}),(0,p.jsx)(`span`,{className:`min-w-0 truncate`,children:_.label})]}),(0,p.jsx)(`span`,{"aria-hidden":`true`,className:`flex shrink-0 items-center`,children:f.slice(1).map(e=>(0,p.jsx)(`span`,{className:r(h(e),`-ms-1.5 w-5 p-0`,n===`standard`&&`h-6 w-6`),title:e.label,"data-selected":e.selected||void 0,"data-disabled":e.disabled||void 0,children:(0,p.jsx)(`span`,{className:`grid shrink-0 place-items-center`,children:e.icon??(0,p.jsx)(`span`,{className:`h-1.5 w-1.5 rounded-full bg-current`})})},e.id))}),g>0&&(0,p.jsxs)(d,{children:[(0,p.jsx)(c,{asChild:!0,children:(0,p.jsxs)(a,{"aria-label":`Show ${g} more badges`,className:r(`ms-1 h-5 shrink-0 px-1.5 text-3xs font-medium tabular-nums`,n===`standard`&&`h-6`),size:`sm`,variant:`ghost`,children:[`+`,g,` more`]})}),(0,p.jsx)(l,{align:`end`,className:`w-56 p-1`,side:`bottom`,children:(0,p.jsx)(`ul`,{"aria-label":`All badges`,className:`grid gap-0.5`,children:e.map(e=>(0,p.jsxs)(`li`,{"aria-current":e.selected?`true`:void 0,"aria-disabled":e.disabled||void 0,className:r(`flex min-h-8 items-center gap-2 rounded-lg px-2 text-xs text-secondary-token`,e.selected&&`bg-surface-1 text-primary-token`,e.disabled&&`opacity-50`),children:[(0,p.jsx)(`span`,{"aria-hidden":`true`,className:r(h(e),`h-4 w-4 p-0 text-3xs`),children:e.icon??(0,p.jsx)(`span`,{className:`h-1.5 w-1.5 rounded-full bg-current`})}),(0,p.jsx)(`span`,{className:`min-w-0 truncate`,children:e.label})]},e.id))})})]})]})}var p,m,h;function g(){return(g=e((()=>{p=t(),n(),s(),i(),u(),m=e=>Math.max(1,e),h=e=>r(o({size:`sm`,tone:e.tone??`neutral`}),`h-5 shrink-0 justify-center border-2 border-surface-0 transition-colors duration-fast ease-interactive motion-reduce:transition-none`,e.selected&&`ring-1 ring-accent/40`,e.disabled&&`opacity-50`,`group-hover/badge-stack:bg-surface-2 group-focus-within/badge-stack:bg-surface-2`)})))()}var _,v,y,b,x,S,C,w,T;function E(){return(E=e((()=>{_=t(),g(),v=[{id:`spotify`,label:`Spotify`,icon:(0,_.jsx)(`span`,{children:`Sp`}),tone:`success`},{id:`apple`,label:`Apple Music`,icon:(0,_.jsx)(`span`,{children:`Am`}),tone:`info`},{id:`youtube`,label:`YouTube`,icon:(0,_.jsx)(`span`,{children:`Yt`}),tone:`error`}],y={title:`UI/Atoms/StackableBadgeGroup`,component:f,parameters:{layout:`centered`},tags:[`autodocs`]},b={args:{items:v,maxVisible:3,density:`dense`,width:`compact`}},x={args:{items:[{id:`long`,label:`Spotify for Artists with a deliberately long label`,icon:(0,_.jsx)(`span`,{children:`Sp`}),tone:`success`},...v.slice(1)],maxVisible:2}},S={args:{items:[v[0],{...v[1],disabled:!0},v[2]],maxVisible:3}},C={args:{items:[...v,{id:`soundcloud`,label:`SoundCloud`,icon:(0,_.jsx)(`span`,{children:`Sc`})},{id:`bandcamp`,label:`Bandcamp`,icon:(0,_.jsx)(`span`,{children:`Bc`})}],maxVisible:1,width:`standard`}},w={args:{items:[v[0],{...v[1],selected:!0},v[2]],maxVisible:3}},T=[`Default`,`LongPrimaryLabel`,`WithDisabledItem`,`OverflowDisclosure`,`SelectedItem`],b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    maxVisible: 3,
    density: 'dense',
    width: 'compact'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    items: [{
      id: 'long',
      label: 'Spotify for Artists with a deliberately long label',
      icon: <span>Sp</span>,
      tone: 'success'
    }, ...ITEMS.slice(1)],
    maxVisible: 2
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    items: [ITEMS[0], {
      ...ITEMS[1],
      disabled: true
    }, ITEMS[2]],
    maxVisible: 3
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    items: [...ITEMS, {
      id: 'soundcloud',
      label: 'SoundCloud',
      icon: <span>Sc</span>
    }, {
      id: 'bandcamp',
      label: 'Bandcamp',
      icon: <span>Bc</span>
    }],
    maxVisible: 1,
    width: 'standard'
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    items: [ITEMS[0], {
      ...ITEMS[1],
      selected: true
    }, ITEMS[2]],
    maxVisible: 3
  }
}`,...w.parameters?.docs?.source}}}})))()}E();export{b as Default,x as LongPrimaryLabel,C as OverflowDisclosure,w as SelectedItem,S as WithDisabledItem,T as __namedExportsOrder,y as default};