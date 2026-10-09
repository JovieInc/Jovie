import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,n as r,o as i,s as a,t as o}from"./card-MwNxHyIZ.js";import{n as s,t as c}from"./linear-surface-C0RqqJIs.js";import{n as l,t as u}from"./DrawerSurfaceCard-D5G20l_R.js";import{n as d,t as f}from"./EntitySidebarShell-_yUqozFw.js";function p({children:e}){return(0,h.jsx)(`div`,{className:`min-h-[360px] w-full bg-(--app-shell-content-surface) p-8`,children:e})}function m({tone:e,children:t}){return(0,h.jsx)(`p`,{className:`mb-4 text-xs ${e===`banned`?`text-error`:`text-secondary-token`}`,children:t})}var h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A,j,M,N;function P(){return(P=e((()=>{h=t(),a(),l(),d(),s(),g=`Surface elevation matrix fixture content. Stable copy keeps screenshots deterministic.`,_={title:`Design System/Elevation Matrix`,parameters:{layout:`fullscreen`}},v={name:`Allowed: Card on shell canvas`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: Card (bg-surface-1 + border-subtle + shadow-card) on the app-shell canvas. Must read as a distinct elevated card in both themes.`}),(0,h.jsxs)(o,{"data-testid":`elevation-card`,children:[(0,h.jsx)(n,{children:(0,h.jsx)(i,{children:`Card on shell canvas`})}),(0,h.jsx)(r,{children:g})]})]})},y={name:`Allowed: recessed well on shell canvas`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: recessed well (bg-surface-0) directly on the shell canvas — e.g. skeleton containers, empty states, input wells.`}),(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-0 p-6`,children:g})]})},b={name:`Allowed: recessed well inside Card`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: inner element uses bg-surface-0 when nested inside a card.`}),(0,h.jsxs)(o,{children:[(0,h.jsx)(n,{children:(0,h.jsx)(i,{children:`Card with recessed well`})}),(0,h.jsx)(r,{children:(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-0 p-4`,children:g})})]})]})},x={name:`Allowed: DrawerSurfaceCard on shell canvas`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: DrawerSurfaceCard variant="card" — border-only, shadow-none (the parent drawer owns the elevation).`}),(0,h.jsx)(u,{variant:`card`,className:`p-4`,children:g})]})},S={name:`Allowed: DrawerSurfaceCard flat inside Card`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: inner elements inside a card use DrawerSurfaceCard variant="flat" (no second elevation).`}),(0,h.jsxs)(o,{children:[(0,h.jsx)(n,{children:(0,h.jsx)(i,{children:`Card with flat inner section`})}),(0,h.jsx)(r,{children:(0,h.jsx)(u,{variant:`flat`,className:`py-2`,children:g})})]})]})},C={name:`Allowed: flat inside DrawerSurfaceCard`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: DrawerSurfaceCard variant="flat" nested inside DrawerSurfaceCard variant="card".`}),(0,h.jsx)(u,{variant:`card`,className:`p-4`,children:(0,h.jsx)(u,{variant:`flat`,className:`py-2`,children:g})})]})},w={name:`Allowed: LINEAR_SURFACE content container`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`allowed`,children:`ALLOWED: table/workspace routes wrap primary content in a bordered LINEAR_SURFACE.contentContainer on the shell canvas.`}),(0,h.jsx)(`div`,{className:`${c.contentContainer} p-6`,children:g})]})},T={name:`Allowed: EntitySidebarShell drawer surface`,render:()=>(0,h.jsx)(`div`,{className:`relative min-h-[480px] w-full bg-(--app-shell-content-surface)`,children:(0,h.jsx)(f,{isOpen:!0,ariaLabel:`Elevation matrix sidebar`,title:`Elevation matrix sidebar`,entityHeader:(0,h.jsx)(`div`,{className:`px-3 py-2`,children:`Entity header`}),children:(0,h.jsx)(`div`,{className:`px-3 py-2`,children:g})})})},E={name:`BANNED: Card inside Card`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): Card nested inside Card — double elevation. Use variant="flat" inner elements instead.`}),(0,h.jsxs)(o,{children:[(0,h.jsx)(n,{children:(0,h.jsx)(i,{children:`Outer card`})}),(0,h.jsx)(r,{children:(0,h.jsx)(o,{children:(0,h.jsx)(r,{children:g})})})]})]})},D={name:`BANNED: DrawerSurfaceCard card inside Card`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): DrawerSurfaceCard variant="card" inside another card — card-within-card nesting. Use variant="flat" for inner elements.`}),(0,h.jsxs)(o,{children:[(0,h.jsx)(n,{children:(0,h.jsx)(i,{children:`Outer card`})}),(0,h.jsx)(r,{children:(0,h.jsx)(u,{variant:`card`,className:`p-4`,children:g})})]})]})},O={name:`BANNED: surface-1 on surface-1 without border`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): bg-surface-1 on a surface-1 parent with no border and no shadow — same color on same color. In light mode the child below is INVISIBLE; that invisibility is the expected baseline.`}),(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-1 p-6`,"data-testid":`surface-parent`,children:(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-1 p-6`,"data-testid":`surface-child`,children:g})})]})},k={name:`BANNED: translucent surface-1 on surface-1`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): bg-surface-1/50 on a surface-1 parent — low-opacity same-color surfaces are nearly invisible.`}),(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-1 p-6`,children:(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-1/50 p-6`,children:g})})]})},A={name:`BANNED: Card with border-0 shadow-none`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): Card className="border-0 shadow-none" strips all elevation from a surface-1 card, making it invisible on a surface-1 parent.`}),(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-1 p-6`,children:(0,h.jsx)(o,{className:`border-0 shadow-none`,children:(0,h.jsx)(r,{children:g})})})]})},j={name:`BANNED: translucent surface-0`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): bg-surface-0/50 — semi-transparent recessed wells must be solid bg-surface-0 instead.`}),(0,h.jsxs)(o,{children:[(0,h.jsx)(n,{children:(0,h.jsx)(i,{children:`Card with translucent well`})}),(0,h.jsx)(r,{children:(0,h.jsx)(`div`,{className:`rounded-lg bg-surface-0/50 p-4`,children:g})})]})]})},M={name:`BANNED: content-surface card inside shell`,render:()=>(0,h.jsxs)(p,{children:[(0,h.jsx)(m,{tone:`banned`,children:`BANNED (should look BROKEN): bg-(--app-shell-content-surface) on a card-like element inside the shell — only shell chrome (toolbar/header/frame) may use the canvas tone. The "card" below blends into the canvas; that is the bug.`}),(0,h.jsx)(`div`,{className:`rounded-lg bg-(--app-shell-content-surface) p-6`,children:g})]})},N=[`CardOnShellCanvas`,`WellOnShellCanvas`,`WellInsideCard`,`DrawerCardOnShell`,`FlatDrawerCardInsideCard`,`FlatDrawerCardInsideDrawerCard`,`ContentContainerOnShell`,`EntitySidebarShellDefault`,`BannedCardInsideCard`,`BannedDrawerCardInsideCard`,`BannedSurface1OnSurface1NoBorder`,`BannedSurface1Translucent`,`BannedCardStrippedElevation`,`BannedSurface0Translucent`,`BannedContentSurfaceCard`],v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: Card on shell canvas',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: Card (bg-surface-1 + border-subtle + shadow-card) on the
        app-shell canvas. Must read as a distinct elevated card in both themes.
      </Note>
      <Card data-testid='elevation-card'>
        <CardHeader>
          <CardTitle>Card on shell canvas</CardTitle>
        </CardHeader>
        <CardContent>{PLACEHOLDER}</CardContent>
      </Card>
    </ShellCanvas>
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: recessed well on shell canvas',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: recessed well (bg-surface-0) directly on the shell canvas —
        e.g. skeleton containers, empty states, input wells.
      </Note>
      <div className='rounded-lg bg-surface-0 p-6'>{PLACEHOLDER}</div>
    </ShellCanvas>
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: recessed well inside Card',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: inner element uses bg-surface-0 when nested inside a card.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Card with recessed well</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg bg-surface-0 p-4'>{PLACEHOLDER}</div>
        </CardContent>
      </Card>
    </ShellCanvas>
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: DrawerSurfaceCard on shell canvas',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: DrawerSurfaceCard variant=&quot;card&quot; — border-only,
        shadow-none (the parent drawer owns the elevation).
      </Note>
      <DrawerSurfaceCard variant='card' className='p-4'>
        {PLACEHOLDER}
      </DrawerSurfaceCard>
    </ShellCanvas>
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: DrawerSurfaceCard flat inside Card',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: inner elements inside a card use DrawerSurfaceCard
        variant=&quot;flat&quot; (no second elevation).
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Card with flat inner section</CardTitle>
        </CardHeader>
        <CardContent>
          <DrawerSurfaceCard variant='flat' className='py-2'>
            {PLACEHOLDER}
          </DrawerSurfaceCard>
        </CardContent>
      </Card>
    </ShellCanvas>
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: flat inside DrawerSurfaceCard',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: DrawerSurfaceCard variant=&quot;flat&quot; nested inside
        DrawerSurfaceCard variant=&quot;card&quot;.
      </Note>
      <DrawerSurfaceCard variant='card' className='p-4'>
        <DrawerSurfaceCard variant='flat' className='py-2'>
          {PLACEHOLDER}
        </DrawerSurfaceCard>
      </DrawerSurfaceCard>
    </ShellCanvas>
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: LINEAR_SURFACE content container',
  render: () => <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: table/workspace routes wrap primary content in a bordered
        LINEAR_SURFACE.contentContainer on the shell canvas.
      </Note>
      <div className={\`\${LINEAR_SURFACE.contentContainer} p-6\`}>
        {PLACEHOLDER}
      </div>
    </ShellCanvas>
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  name: 'Allowed: EntitySidebarShell drawer surface',
  render: () => <div className='relative min-h-[480px] w-full bg-(--app-shell-content-surface)'>
      <EntitySidebarShell isOpen ariaLabel='Elevation matrix sidebar' title='Elevation matrix sidebar' entityHeader={<div className='px-3 py-2'>Entity header</div>}>
        <div className='px-3 py-2'>{PLACEHOLDER}</div>
      </EntitySidebarShell>
    </div>
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: Card inside Card',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): Card nested inside Card — double elevation.
        Use variant=&quot;flat&quot; inner elements instead.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Outer card</CardTitle>
        </CardHeader>
        <CardContent>
          <Card>
            <CardContent>{PLACEHOLDER}</CardContent>
          </Card>
        </CardContent>
      </Card>
    </ShellCanvas>
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: DrawerSurfaceCard card inside Card',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): DrawerSurfaceCard variant=&quot;card&quot;
        inside another card — card-within-card nesting. Use
        variant=&quot;flat&quot; for inner elements.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Outer card</CardTitle>
        </CardHeader>
        <CardContent>
          <DrawerSurfaceCard variant='card' className='p-4'>
            {PLACEHOLDER}
          </DrawerSurfaceCard>
        </CardContent>
      </Card>
    </ShellCanvas>
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: surface-1 on surface-1 without border',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-surface-1 on a surface-1 parent with no
        border and no shadow — same color on same color. In light mode the child
        below is INVISIBLE; that invisibility is the expected baseline.
      </Note>
      <div className='rounded-lg bg-surface-1 p-6' data-testid='surface-parent'>
        <div className='rounded-lg bg-surface-1 p-6' data-testid='surface-child'>
          {PLACEHOLDER}
        </div>
      </div>
    </ShellCanvas>
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: translucent surface-1 on surface-1',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-surface-1/50 on a surface-1 parent —
        low-opacity same-color surfaces are nearly invisible.
      </Note>
      <div className='rounded-lg bg-surface-1 p-6'>
        <div className='rounded-lg bg-surface-1/50 p-6'>{PLACEHOLDER}</div>
      </div>
    </ShellCanvas>
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: Card with border-0 shadow-none',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): Card className=&quot;border-0
        shadow-none&quot; strips all elevation from a surface-1 card, making it
        invisible on a surface-1 parent.
      </Note>
      <div className='rounded-lg bg-surface-1 p-6'>
        <Card className='border-0 shadow-none'>
          <CardContent>{PLACEHOLDER}</CardContent>
        </Card>
      </div>
    </ShellCanvas>
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: translucent surface-0',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-surface-0/50 — semi-transparent recessed
        wells must be solid bg-surface-0 instead.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Card with translucent well</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg bg-surface-0/50 p-4'>{PLACEHOLDER}</div>
        </CardContent>
      </Card>
    </ShellCanvas>
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  name: 'BANNED: content-surface card inside shell',
  render: () => <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-(--app-shell-content-surface) on a
        card-like element inside the shell — only shell chrome
        (toolbar/header/frame) may use the canvas tone. The &quot;card&quot;
        below blends into the canvas; that is the bug.
      </Note>
      <div className='rounded-lg bg-(--app-shell-content-surface) p-6'>
        {PLACEHOLDER}
      </div>
    </ShellCanvas>
}`,...M.parameters?.docs?.source}}}})))()}P();export{E as BannedCardInsideCard,A as BannedCardStrippedElevation,M as BannedContentSurfaceCard,D as BannedDrawerCardInsideCard,j as BannedSurface0Translucent,O as BannedSurface1OnSurface1NoBorder,k as BannedSurface1Translucent,v as CardOnShellCanvas,w as ContentContainerOnShell,x as DrawerCardOnShell,T as EntitySidebarShellDefault,S as FlatDrawerCardInsideCard,C as FlatDrawerCardInsideDrawerCard,b as WellInsideCard,y as WellOnShellCanvas,N as __namedExportsOrder,_ as default};