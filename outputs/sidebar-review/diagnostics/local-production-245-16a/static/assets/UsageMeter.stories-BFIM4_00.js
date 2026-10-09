import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./UsageMeter-DULyi3Hw.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`Molecules/UsageMeter`,component:r,parameters:{layout:`centered`,backgrounds:{default:`dark`},docs:{description:{component:`Single weekly usage meter with one warning threshold and semantic healthy, warning, and exhausted states.`}}},decorators:[e=>(0,i.jsx)(`div`,{className:`w-96 rounded-xl border border-subtle bg-surface-1`,children:(0,i.jsx)(e,{})})],args:{label:`Weekly Messages`,resetLabel:`Resets Aug 24, 11:00 AM`,model:{used:20,limit:70,remaining:50,remainingPercent:71,state:`healthy`,resetAt:`2026-08-24T18:00:00.000Z`,warningRemainingPercent:20}}},o={},s={args:{model:{used:58,limit:70,remaining:12,remainingPercent:17,state:`warning`,resetAt:`2026-08-24T18:00:00.000Z`,warningRemainingPercent:20}}},c={args:{model:{used:70,limit:70,remaining:0,remainingPercent:0,state:`exhausted`,resetAt:`2026-08-24T18:00:00.000Z`,warningRemainingPercent:20}}},l=[`Healthy`,`Warning`,`Exhausted`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    model: {
      used: 58,
      limit: 70,
      remaining: 12,
      remainingPercent: 17,
      state: 'warning',
      resetAt: '2026-08-24T18:00:00.000Z',
      warningRemainingPercent: 20
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    model: {
      used: 70,
      limit: 70,
      remaining: 0,
      remainingPercent: 0,
      state: 'exhausted',
      resetAt: '2026-08-24T18:00:00.000Z',
      warningRemainingPercent: 20
    }
  }
}`,...c.parameters?.docs?.source}}}})))()}u();export{c as Exhausted,o as Healthy,s as Warning,l as __namedExportsOrder,a as default};