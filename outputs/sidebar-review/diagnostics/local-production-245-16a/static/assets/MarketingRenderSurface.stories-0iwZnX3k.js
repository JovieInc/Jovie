import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./MarketingRenderSurface-DKanZVcv.js";var a,o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{a=t(),r(),o={title:`Features/Home/MarketingRenderSurface`,component:n,parameters:{layout:`centered`,backgrounds:{default:`dark`},jovie:{uncoveredProps:[`hideChrome`]}},decorators:[e=>(0,a.jsx)(`div`,{className:`w-full max-w-md`,children:(0,a.jsx)(e,{})})]},s={args:{surfaceId:`profile`}},c={args:{surfaceId:`notification`}},l={args:{surfaceId:`tips`}},u={args:{surfaceId:`countdown`}},d={args:{surfaceId:`fans`}},f={args:{surfaceId:`compact-glass`}},p={args:{surfaceId:`tour`}},m={args:{surfaceId:`profile`},render:()=>(0,a.jsx)(`div`,{className:`grid gap-4`,children:i.map(e=>(0,a.jsx)(n,{surfaceId:e.id},e.id))})},h=[`Profile`,`Notification`,`Tips`,`Countdown`,`Fans`,`CompactGlass`,`Tour`,`AllRouteSurfaces`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'profile'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'notification'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'tips'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'countdown'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'fans'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'compact-glass'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'tour'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    surfaceId: 'profile'
  },
  render: () => <div className='grid gap-4'>
      {MARKETING_RENDER_ROUTE_SURFACES.map(surface => <MarketingRenderSurface key={surface.id} surfaceId={surface.id} />)}
    </div>
}`,...m.parameters?.docs?.source},description:{story:`Every routable surface id resolves to a rendered surface.`,...m.parameters?.docs?.description}}}})))()}g();export{m as AllRouteSurfaces,f as CompactGlass,u as Countdown,d as Fans,c as Notification,s as Profile,l as Tips,p as Tour,h as __namedExportsOrder,o as default};