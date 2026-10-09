import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{o as n,r}from"./navigation-lA0z5ElE.js";import{t as i}from"./jsx-runtime-BbDfbRii.js";import{n as a,t as o}from"./AppSegmentControl-C2YqtUdZ.js";function s({value:e,options:t,...r}){let i=n(),a=(0,l.useCallback)(n=>{if(n===e)return;let r=t.find(e=>e.value===n);r&&!r.disabled&&i.push(r.href)},[t,i,e]);return(0,c.jsx)(o,{...r,value:e,onValueChange:a,options:t})}var c,l;function u(){return(u=e((()=>{c=i(),r(),l=t(),a()})))()}var d,f,p,m,h,g,_;function v(){return(v=e((()=>{d=i(),u(),f={title:`UI/Molecules/RouteSegmentControl`,component:s,parameters:{layout:`centered`,nextjs:{appDirectory:!0,navigation:{pathname:`/app/contacts`,query:{}}},docs:{description:{component:`Route-aware adapter for the canonical SegmentControl. It preserves selected, focus, keyboard, and 44px touch-target behavior without introducing a second visual owner.`}}},tags:[`autodocs`]},p=[{value:`contacts`,label:`Contacts`,href:`/app/contacts`},{value:`audience`,label:`Audience`,href:`/app/contacts?tab=audience`}],m={args:{value:`contacts`,options:p,"aria-label":`Contacts Workspace`,className:`max-w-60`},render:e=>(0,d.jsx)(`div`,{className:`w-96 bg-(--app-shell-content-surface) p-3`,children:(0,d.jsx)(s,{...e})})},h={args:{value:`audience`,options:p,"aria-label":`Contacts Workspace`},render:e=>(0,d.jsx)(`div`,{className:`w-44 bg-(--app-shell-content-surface) p-2`,children:(0,d.jsx)(s,{...e})})},g={args:{value:`contacts`,options:[p[0],{...p[1],disabled:!0}],"aria-label":`Contacts Workspace`,className:`max-w-60`}},_=[`ContactsWorkspace`,`Narrow`,`WithDisabledRoute`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'contacts',
    options,
    'aria-label': 'Contacts Workspace',
    className: 'max-w-60'
  },
  render: args => <div className='w-96 bg-(--app-shell-content-surface) p-3'>
      <RouteSegmentControl {...args} />
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'audience',
    options,
    'aria-label': 'Contacts Workspace'
  },
  render: args => <div className='w-44 bg-(--app-shell-content-surface) p-2'>
      <RouteSegmentControl {...args} />
    </div>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'contacts',
    options: [options[0], {
      ...options[1],
      disabled: true
    }],
    'aria-label': 'Contacts Workspace',
    className: 'max-w-60'
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{m as ContactsWorkspace,h as Narrow,g as WithDisabledRoute,_ as __namedExportsOrder,f as default};