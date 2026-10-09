import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";import{n as a,t as o}from"./RightDrawer-Dym2xKcC.js";import{n as s,t as c}from"./RailToggleButton-BXgbCyM3.js";import{n as l,t as u}from"./context-CDpFhzjN.js";import{n as d,t as f}from"./sidebar-3763fr4e.js";import{n as p,t as m}from"./DashboardHeader-98hmbfnT.js";import{n as h,t as g}from"./AppShellFrame-CzA8Me4D.js";import"./system-b-app-0raEe-jZ.js";import{i as _,r as v}from"./PageShell-CxlxIPuU.js";import{n as y,t as b}from"./SettingsSection-ASx6BKxx.js";function x({children:e}){return(0,S.jsx)(v,{maxWidth:`wide`,frame:`none`,contentPadding:`none`,scroll:`page`,surfaceClassName:`pb-10`,"data-testid":`settings-shell-content`,children:(0,S.jsx)(`div`,{className:`mx-auto min-w-0 w-full max-w-(--app-shell-content-max-form) space-y-6`,"data-settings-layout-column":`true`,children:e})})}var S;function C(){return(C=e((()=>{S=n(),_()})))()}function w(){let[e,t]=(0,E.useState)(!1);return(0,T.jsx)(u,{defaultOpen:!1,children:(0,T.jsx)(g,{containerClassName:`h-dvh`,sidebar:(0,T.jsx)(f,{collapsible:`icon`,children:`Navigation`}),header:(0,T.jsxs)(`div`,{className:`flex h-12 items-center justify-between px-3`,children:[(0,T.jsx)(`span`,{children:`Work`}),(0,T.jsx)(c,{side:`right`,open:e,openLabel:`Collapse details`,closedLabel:`Expand details`,controlsId:`story-inspector`,onToggle:()=>t(e=>!e)})]}),main:(0,T.jsxs)(`div`,{"data-testid":`story-route-scroll`,className:`h-full overflow-auto`,children:[(0,T.jsxs)(`label`,{className:`block p-4`,children:[`Notes`,(0,T.jsx)(`textarea`,{className:`block w-full`,defaultValue:`Keep this draft`})]}),(0,T.jsx)(`div`,{className:`p-4`,style:{height:1600},children:`Scrollable work content`})]}),rightPanel:(0,T.jsx)(o,{id:`story-inspector`,"data-testid":`story-inspector`,isOpen:e,width:400,ariaLabel:`Work details`,onKeyDown:e=>{e.key===`Escape`&&t(!1)},children:(0,T.jsxs)(`div`,{className:`h-full overflow-auto p-4`,children:[(0,T.jsx)(i,{type:`button`,onClick:()=>t(!1),children:`Close details`}),(0,T.jsxs)(`label`,{className:`block py-4`,children:[`Detail notes`,(0,T.jsx)(`input`,{className:`block w-full`,defaultValue:`Inspector draft`})]}),(0,T.jsx)(`p`,{children:`Context stays inside the content panel, below its header.`})]})})})})}var T,E,D,O,k,A,j,M,N,P,F;function I(){return(I=e((()=>{T=n(),r(),E=t(),C(),s(),p(),y(),a(),h(),d(),l(),D={title:`Organisms/AppShellFrame`,component:g,parameters:{layout:`fullscreen`},args:{sidebar:(0,T.jsx)(`aside`,{className:`h-full w-56 p-4`,children:`Navigation`}),header:(0,T.jsx)(`header`,{className:`px-3 py-2`,children:`Library`}),main:(0,T.jsx)(`div`,{className:`p-3`,children:`Main content`})}},O={},k={args:{chatAmbientGradient:!0,containerClassName:`h-dvh`}},A={args:{rightPanel:(0,T.jsx)(`aside`,{className:`h-full w-80 p-3`,children:`Entity details`})}},j={render:()=>(0,T.jsx)(u,{children:(0,T.jsx)(g,{sidebar:(0,T.jsx)(f,{collapsible:`icon`,children:(0,T.jsx)(`div`,{className:`p-3`,children:`Jovie`})}),header:(0,T.jsx)(m,{breadcrumbs:[{label:`New Chat`}],action:(0,T.jsx)(i,{type:`button`,children:`Help`})}),main:(0,T.jsx)(`div`,{className:`p-4`,children:`Main content`})})})},M={render:()=>(0,T.jsx)(u,{children:(0,T.jsx)(g,{sidebar:(0,T.jsx)(f,{collapsible:`offcanvas`,children:`Jovie`}),main:(0,T.jsx)(i,{type:`button`,children:`Route header action`})})})},N={render:()=>(0,T.jsx)(u,{children:(0,T.jsx)(g,{sidebar:(0,T.jsx)(f,{collapsible:`offcanvas`,children:`Jovie`}),main:(0,T.jsx)(x,{children:(0,T.jsx)(b,{id:`account`,title:`Account`,description:`Security, theme, and notifications.`,headerAction:(0,T.jsx)(i,{type:`button`,children:`Save`}),children:(0,T.jsx)(`p`,{children:`Account settings`})})})})})},P={render:()=>(0,T.jsx)(w,{})},F=[`Default`,`ChatAmbientGradient`,`WithInspector`,`HeaderAlignment`,`RouteOwnedHeader`,`SettingsHeaderAlignment`,`OverlayInspector`],O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    chatAmbientGradient: true,
    containerClassName: 'h-dvh'
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    rightPanel: <aside className='h-full w-80 p-3'>Entity details</aside>
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  render: () => <SidebarProvider>
      <AppShellFrame sidebar={
    // Icon collapsible matches the production UnifiedSidebar contract:
    // collapsing leaves a visible icon rail rather than a 0-width mount,
    // which is the composition the desktop titlebar geometry targets.
    <Sidebar collapsible='icon'>
            <div className='p-3'>Jovie</div>
          </Sidebar>} header={<DashboardHeader breadcrumbs={[{
      label: 'New Chat'
    }]} action={<Button type='button'>Help</Button>} />} main={<div className='p-4'>Main content</div>} />
    </SidebarProvider>
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  render: () => <SidebarProvider>
      <AppShellFrame sidebar={<Sidebar collapsible='offcanvas'>Jovie</Sidebar>} main={<Button type='button'>Route header action</Button>} />
    </SidebarProvider>
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  render: () => <SidebarProvider>
      <AppShellFrame sidebar={<Sidebar collapsible='offcanvas'>Jovie</Sidebar>} main={<SettingsLayout>
            <SettingsSection id='account' title='Account' description='Security, theme, and notifications.' headerAction={<Button type='button'>Save</Button>}>
              <p>Account settings</p>
            </SettingsSection>
          </SettingsLayout>} />
    </SidebarProvider>
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  render: () => <OverlayInspectorFixture />
}`,...P.parameters?.docs?.source}}}})))()}I();export{k as ChatAmbientGradient,O as Default,j as HeaderAlignment,P as OverlayInspector,M as RouteOwnedHeader,N as SettingsHeaderAlignment,A as WithInspector,F as __namedExportsOrder,D as default};