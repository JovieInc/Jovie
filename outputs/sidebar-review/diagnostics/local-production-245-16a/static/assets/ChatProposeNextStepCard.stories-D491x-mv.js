import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./ChatProposeNextStepCard-Cwt9FNhd.js";var r,i,a,o,s;function c(){return(c=e((()=>{t(),r={title:`Features/Onboarding/ChatProposeNextStepCard`,component:n,parameters:{layout:`centered`}},i={args:{payload:{action:`propose_next_step`,decision:{kind:`instant_access`,rationale:`High-intent artist with an active release.`,score:.92}}}},a={args:{payload:{action:`propose_next_step`,decision:{kind:`waitlist`,rationale:`Early-stage artist, low urgency.`,score:.34}}}},o={args:{payload:{action:`propose_next_step`,decision:{kind:`needs_more_info`,rationale:`Not enough signal yet.`,score:.5}}}},s=[`InstantAccess`,`Waitlist`,`NeedsMoreInfo`],i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  args: {
    payload: {
      action: 'propose_next_step',
      decision: {
        kind: 'instant_access',
        rationale: 'High-intent artist with an active release.',
        score: 0.92
      }
    }
  }
}`,...i.parameters?.docs?.source}}},a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    payload: {
      action: 'propose_next_step',
      decision: {
        kind: 'waitlist',
        rationale: 'Early-stage artist, low urgency.',
        score: 0.34
      }
    }
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    payload: {
      action: 'propose_next_step',
      decision: {
        kind: 'needs_more_info',
        rationale: 'Not enough signal yet.',
        score: 0.5
      }
    }
  }
}`,...o.parameters?.docs?.source}}}})))()}c();export{i as InstantAccess,o as NeedsMoreInfo,a as Waitlist,s as __namedExportsOrder,r as default};