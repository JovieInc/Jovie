import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./MatchStatusBadge-BMMHyltE.js";var i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{i=t(),n(),a={title:`Dashboard/Atoms/MatchStatusBadge`,component:r,parameters:{layout:`centered`},args:{status:`suggested`},argTypes:{status:{control:`select`,options:[`suggested`,`confirmed`,`auto_confirmed`,`rejected`]},size:{control:`select`,options:[`sm`,`md`]}}},o={},s={args:{status:`confirmed`}},c={args:{status:`auto_confirmed`}},l={args:{status:`rejected`}},u={args:{status:`confirmed`,size:`sm`}},d={render:()=>(0,i.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,i.jsx)(r,{status:`suggested`}),(0,i.jsx)(r,{status:`confirmed`}),(0,i.jsx)(r,{status:`auto_confirmed`}),(0,i.jsx)(r,{status:`rejected`})]})},f=[`Suggested`,`Confirmed`,`AutoConfirmed`,`Rejected`,`Small`,`AllStatuses`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'confirmed'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'auto_confirmed'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'rejected'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'confirmed',
    size: 'sm'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      <MatchStatusBadge status='suggested' />
      <MatchStatusBadge status='confirmed' />
      <MatchStatusBadge status='auto_confirmed' />
      <MatchStatusBadge status='rejected' />
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as AllStatuses,c as AutoConfirmed,s as Confirmed,l as Rejected,u as Small,o as Suggested,f as __namedExportsOrder,a as default};