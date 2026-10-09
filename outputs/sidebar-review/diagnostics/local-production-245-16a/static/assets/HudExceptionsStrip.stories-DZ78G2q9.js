import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./circle-alert-B-EGAHI2.js";import{r as i,t as a}from"./ContentSurfaceCard-NsoaLSLh.js";import{r as o,t as s}from"./hud-cockpit-B7HADZRt.js";import{n as c,t as l}from"./cockpit-ZfQ-qsn_.js";function u({metrics:e}){let t=l(e);return(0,d.jsx)(a,{surface:`details`,"data-testid":`hud-exceptions`,className:`overflow-hidden`,children:(0,d.jsxs)(`div`,{className:`flex flex-wrap items-center gap-x-4 gap-y-2 p-3`,children:[(0,d.jsx)(`p`,{className:`text-2xs font-semibold tracking-normal text-tertiary-token`,children:`Needs attention`}),t.length===0?(0,d.jsx)(`p`,{className:`text-xs text-secondary-token`,children:`No exceptions — systems nominal.`}):t.map(e=>(0,d.jsxs)(`span`,{className:`inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-3 py-1 text-2xs font-medium text-primary-token`,title:e.detail??void 0,children:[(0,d.jsx)(r,{className:`h-3 w-3 text-error`,"aria-hidden":`true`}),e.label]},e.id))]})})}var d;function f(){return(f=e((()=>{d=t(),n(),i(),c()})))()}var p,m,h,g;function _(){return(_=e((()=>{o(),f(),p={title:`Features/Admin/Hud/HudExceptionsStrip`,component:u,parameters:{layout:`centered`}},m={args:{metrics:s()}},h={args:{metrics:s({operations:{status:`degraded`,dbLatencyMs:240}})}},g=[`Nominal`,`Degraded`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    metrics: cockpitMetrics()
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    metrics: cockpitMetrics({
      operations: {
        status: 'degraded',
        dbLatencyMs: 240
      }
    })
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{h as Degraded,m as Nominal,g as __namedExportsOrder,p as default};