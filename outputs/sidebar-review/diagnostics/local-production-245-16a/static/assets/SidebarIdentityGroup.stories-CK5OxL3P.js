import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./external-link-BBnrbU00.js";import{n as i,t as a}from"./link-e-necIhk.js";import{n as o,r as s}from"./useJovieAuth-BIVJUTCS.js";import{o as c,r as l}from"./domains-DzNsaUR3.js";import{n as u,t as d}from"./SidebarIdentityGroup-D3zy-M1O.js";import{n as f,r as p}from"./signed-in-session-D_LAMto1.js";function m({profileHref:e,displayName:t}){let n=`${l}${e}`;return(0,h.jsxs)(`div`,{"data-testid":g,"data-identity-split-fixture":``,"data-deliberate-red":``,className:`flex flex-col gap-1`,style:_,children:[(0,h.jsx)(`fieldset`,{"aria-label":`Public Profile`,"data-sidebar":`public-profile-row`,className:`m-0 rounded-md border-0 p-0 px-2 py-1`,children:(0,h.jsxs)(`a`,{href:e,className:`flex items-center gap-2`,children:[(0,h.jsx)(r,{"aria-hidden":`true`,className:`size-3.5`}),(0,h.jsxs)(`span`,{children:[(0,h.jsx)(`span`,{className:`block`,children:`Public Profile`}),(0,h.jsx)(`span`,{className:`block text-2xs`,children:n})]})]})}),(0,h.jsx)(`fieldset`,{"aria-label":`Creator Identity`,"data-sidebar":`creator-identity-row`,className:`m-0 rounded-md border-0 p-0 px-2 py-1`,children:(0,h.jsx)(`button`,{type:`button`,children:t})})]})}var h,g,_;function v(){return(v=e((()=>{h=t(),n(),c(),g=`sidebar-identity-split-fixture`,_={outline:`2px solid #ff0000`}})))()}function y({collapsible:e,width:t,children:n}){return(0,b.jsx)(`div`,{className:`group bg-base text-sidebar-foreground`,"data-collapsible":e,style:{width:t},children:n})}var b,x,S,C,w,T,E,D,O;function k(){return(k=e((()=>{b=t(),a(),f(),s(),v(),u(),x={title:`Organisms/SidebarIdentityGroup`,component:d,parameters:{layout:`centered`,jovie:{uncoveredProps:[]}},decorators:[p,e=>(0,b.jsx)(o,{children:(0,b.jsx)(e,{})})],args:{profileHref:`/timwhite`}},S={decorators:[e=>(0,b.jsx)(y,{width:224,children:(0,b.jsx)(e,{})})]},C={decorators:[e=>(0,b.jsx)(y,{width:160,children:(0,b.jsx)(e,{})})]},w={decorators:[e=>(0,b.jsx)(y,{width:52,collapsible:`icon`,children:(0,b.jsx)(e,{})})]},T={render:()=>(0,b.jsx)(y,{width:224,children:(0,b.jsx)(m,{profileHref:`/timwhite`,displayName:`Tim White`})})},E={render:()=>(0,b.jsxs)(`div`,{className:`flex items-start gap-8 bg-base p-6 text-sidebar-foreground`,children:[(0,b.jsxs)(`div`,{className:`flex flex-col gap-6`,children:[(0,b.jsx)(y,{width:224,children:(0,b.jsx)(d,{profileHref:`/timwhite`})}),(0,b.jsx)(y,{width:160,children:(0,b.jsx)(d,{profileHref:`/timwhite`})}),(0,b.jsx)(y,{width:52,collapsible:`icon`,children:(0,b.jsx)(d,{profileHref:`/timwhite`})})]}),(0,b.jsxs)(`div`,{"data-testid":`profile-identity-surface`,className:`rounded-xl border border-sidebar-border px-4 py-3`,style:{width:280},children:[(0,b.jsx)(`p`,{className:`text-app text-sidebar-item-foreground`,children:`Tim White`}),(0,b.jsx)(i,{href:`/timwhite`,className:`text-2xs text-sidebar-muted`,children:`jov.ie/timwhite`})]})]})},D={...S,args:{profileHref:void 0}},O=[`Expanded`,`Narrow`,`Collapsed`,`SplitLayoutFixture`,`SidebarAndProfileSweep`,`WithoutPublicProfile`],S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RailFrame width={224}>
        <Story />
      </RailFrame>]
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RailFrame width={160}>
        <Story />
      </RailFrame>]
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RailFrame width={52} collapsible='icon'>
        <Story />
      </RailFrame>]
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  render: () => <RailFrame width={224}>
      <SidebarIdentitySplitLayoutFixture profileHref='/timwhite' displayName='Tim White' />
    </RailFrame>
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-start gap-8 bg-base p-6 text-sidebar-foreground'>
      <div className='flex flex-col gap-6'>
        <RailFrame width={224}>
          <SidebarIdentityGroup profileHref='/timwhite' />
        </RailFrame>
        <RailFrame width={160}>
          <SidebarIdentityGroup profileHref='/timwhite' />
        </RailFrame>
        <RailFrame width={52} collapsible='icon'>
          <SidebarIdentityGroup profileHref='/timwhite' />
        </RailFrame>
      </div>
      <div data-testid='profile-identity-surface' className='rounded-xl border border-sidebar-border px-4 py-3' style={{
      width: 280
    }}>
        <p className='text-app text-sidebar-item-foreground'>Tim White</p>
        <Link href='/timwhite' className='text-2xs text-sidebar-muted'>
          jov.ie/timwhite
        </Link>
      </div>
    </div>
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  ...Expanded,
  args: {
    profileHref: undefined
  }
}`,...D.parameters?.docs?.source}}}})))()}k();export{w as Collapsed,S as Expanded,C as Narrow,E as SidebarAndProfileSweep,T as SplitLayoutFixture,D as WithoutPublicProfile,O as __namedExportsOrder,x as default};