import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{H as r,U as i}from"./removable-_8fTgXVw.js";import{c as a,s as o}from"./iframe-B1b4EUuv.js";import{n as s,t as c}from"./BillingActionsSection-Mx3B0PQJ.js";function l({initialOpen:e=!1,pending:t=!1}){let[n,i]=(0,d.useState)(e);return(0,u.jsx)(r,{client:f,children:(0,u.jsx)(`div`,{className:`w-full max-w-2xl`,children:(0,u.jsx)(c,{cancelDialogOpen:n,setCancelDialogOpen:i,handleCancelSubscription:()=>void 0,cancelMutationPending:t})})})}var u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{u=n(),a(),i(),d=t(),s(),f=new o({defaultOptions:{queries:{retry:!1}}}),p={title:`Organisms/Billing/BillingActionsSection`,component:c,parameters:{layout:`centered`}},m={args:{cancelDialogOpen:!1,setCancelDialogOpen:()=>{},handleCancelSubscription:()=>{},cancelMutationPending:!1},render:()=>(0,u.jsx)(l,{})},h={args:{cancelDialogOpen:!1,setCancelDialogOpen:()=>{},handleCancelSubscription:()=>{},cancelMutationPending:!1},render:()=>(0,u.jsx)(l,{initialOpen:!0})},g={args:{cancelDialogOpen:!1,setCancelDialogOpen:()=>{},handleCancelSubscription:()=>{},cancelMutationPending:!1},render:()=>(0,u.jsx)(l,{initialOpen:!0,pending:!0})},_=[`Default`,`CancellationDialog`,`PendingCancellation`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    cancelDialogOpen: false,
    setCancelDialogOpen: () => {},
    handleCancelSubscription: () => {},
    cancelMutationPending: false
  },
  render: () => <BillingActionsStory />
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    cancelDialogOpen: false,
    setCancelDialogOpen: () => {},
    handleCancelSubscription: () => {},
    cancelMutationPending: false
  },
  render: () => <BillingActionsStory initialOpen />
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    cancelDialogOpen: false,
    setCancelDialogOpen: () => {},
    handleCancelSubscription: () => {},
    cancelMutationPending: false
  },
  render: () => <BillingActionsStory initialOpen pending />
}`,...g.parameters?.docs?.source}}}})))()}v();export{h as CancellationDialog,m as Default,g as PendingCancellation,_ as __namedExportsOrder,p as default};