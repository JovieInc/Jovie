import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./CertificationDetailRail-lZEWw8GA.js";import{h as i,p as a}from"./iframe-B1b4EUuv.js";import{a as o,i as s,n as c,r as l,t as u}from"./fixtures-CkBtG5dP.js";var d,f,p,m,h,g,_,v,y,b,x,S;function C(){return(C=e((()=>{d=t(),i(),o(),n(),{fn:f}=__STORYBOOK_MODULE_TEST__,p=s(`signup-golden-path`),m=s(`claim-profile`,{packet:c(`claim-profile`,{visualProof:[l(`visual_proof`,`claim-visual`,`failed`)]})}),h=u().rows[2]??null,g={title:`Features/Admin/Certifications/CertificationDetailRail`,component:r,parameters:{layout:`fullscreen`},decorators:[e=>(0,d.jsx)(a,{children:(0,d.jsx)(`div`,{className:`flex min-h-180 justify-end bg-(--app-shell-content-surface) text-primary-token`,children:(0,d.jsx)(e,{})})})],args:{row:p,onClose:f(),onDecide:f(async()=>void 0),pendingDecision:null,decisionError:null}},_={},v={args:{row:m}},y={args:{row:h}},b={args:{decisionError:`The evidence changed since this page loaded.`}},x={args:{row:null}},S=[`ReviewReady`,`Blocked`,`Certified`,`DecisionError`,`Empty`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    row: blocked
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    row: certified
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    decisionError: 'The evidence changed since this page loaded.'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    row: null
  }
}`,...x.parameters?.docs?.source}}}})))()}C();export{v as Blocked,y as Certified,b as DecisionError,x as Empty,_ as ReviewReady,S as __namedExportsOrder,g as default};