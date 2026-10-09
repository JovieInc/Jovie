import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./WorkflowStatusPill-Cgmf0v6-.js";var a,o,s,c,l;function u(){return(u=e((()=>{a=t(),r(),o={title:`Features/Admin/WorkflowStatusPill`,component:n,parameters:{layout:`centered`}},s={args:{status:`running`},render:()=>(0,a.jsx)(`div`,{className:`flex flex-wrap gap-2`,children:[`queued`,`running`,`blocked`,`review`,`done`,`failed`,`stale`].map(e=>(0,a.jsx)(n,{status:e},e))})},c={args:{status:`passed`},render:()=>(0,a.jsx)(`div`,{className:`flex flex-wrap gap-2`,children:[`missing`,`queued`,`running`,`passed`,`failed`,`skipped`,`blocked`].map(e=>(0,a.jsx)(i,{status:e},e))})},l=[`AllRunStatuses`,`AllVerificationGateStatuses`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'running'
  },
  render: () => <div className='flex flex-wrap gap-2'>
      {(['queued', 'running', 'blocked', 'review', 'done', 'failed', 'stale'] as const).map(status => <WorkflowStatusPill key={status} status={status} />)}
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'passed'
  },
  render: () => <div className='flex flex-wrap gap-2'>
      {(['missing', 'queued', 'running', 'passed', 'failed', 'skipped', 'blocked'] as const).map(status => <VerificationStatusPill key={status} status={status} />)}
    </div>
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as AllRunStatuses,c as AllVerificationGateStatuses,l as __namedExportsOrder,o as default};