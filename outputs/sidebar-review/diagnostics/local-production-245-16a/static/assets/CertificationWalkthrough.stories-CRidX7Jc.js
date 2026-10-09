import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{h as n,p as r}from"./iframe-B1b4EUuv.js";import{a as i,i as a,n as o,r as s}from"./fixtures-CkBtG5dP.js";import"./system-b-app-0raEe-jZ.js";import{n as c,t as l}from"./CertificationWalkthrough-CHHHEiUc.js";var u,d,f,p,m,h,g,_,v,y,b;function x(){return(x=e((()=>{u=t(),n(),i(),c(),{fn:d}=__STORYBOOK_MODULE_TEST__,f=a(`signup-golden-path`),p=a(`checkout-happy-path`,{packet:o(`checkout-happy-path`,{visualProof:[s(`visual_proof`,`checkout-happy-path-visual`,`passed`,`https://example.test/proof.webm`)]})}),m={title:`Features/Admin/Certifications/CertificationWalkthrough`,component:l,parameters:{layout:`fullscreen`,viewport:{defaultViewport:`desktop`}},decorators:[e=>(0,u.jsx)(r,{children:(0,u.jsx)(`div`,{className:`min-h-180 bg-(--app-shell-content-surface) text-primary-token`,children:(0,u.jsx)(e,{})})})],args:{row:f,open:!0,onOpenChange:d(),onDecide:d(async(e,t)=>{}),pendingDecision:null}},h={},g={args:{row:p}},_={args:{pendingDecision:`approved`}},v={args:{row:a(`contact-page`,{packet:o(`contact-page`,{visualProof:[s(`visual_proof`,`contact-image`,`passed`,`/product-screenshots/tim-white-profile-contact-phone.png`)]})})}},y={args:{row:a(`missing-proof`,{packet:o(`missing-proof`,{visualProof:[s(`visual_proof`,`missing-image`,`passed`,`/missing-certification-proof.png`)]})})}},b=[`ImageEvidence`,`VideoEvidence`,`DecisionPending`,`PublicScreenshotRef`,`MissingScreenshot`],h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    row: videoEvidence
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    pendingDecision: 'approved'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    row: fixtureRow('contact-page', {
      packet: fixturePacket('contact-page', {
        visualProof: [fixtureReceipt('visual_proof', 'contact-image', 'passed', '/product-screenshots/tim-white-profile-contact-phone.png')]
      })
    })
  }
}`,...v.parameters?.docs?.source},description:{story:`Existing public capture, presented as a component fixture, not certification.`,...v.parameters?.docs?.description}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    row: fixtureRow('missing-proof', {
      packet: fixturePacket('missing-proof', {
        visualProof: [fixtureReceipt('visual_proof', 'missing-image', 'passed', '/missing-certification-proof.png')]
      })
    })
  }
}`,...y.parameters?.docs?.source}}}})))()}x();export{_ as DecisionPending,h as ImageEvidence,y as MissingScreenshot,v as PublicScreenshotRef,g as VideoEvidence,b as __namedExportsOrder,m as default};