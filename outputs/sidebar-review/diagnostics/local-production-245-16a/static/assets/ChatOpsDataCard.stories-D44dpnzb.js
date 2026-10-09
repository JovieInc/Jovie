import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ChatOpsDataCard-Bx4Yd2ZS.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={schema:`summer.ops-card.v1`,kind:`shipping`,title:`Shipping lanes`,state:`fresh`,observedAt:`2026-09-27T09:00:00.000Z`,source:`ubuntu-operational-truth`,facts:[{label:`Merge queue`,value:`3`},{label:`Running tasks`,value:`2`},{label:`Blocked`,value:`Not measured`}],series:{label:`Live counts`,points:[{label:`Queued`,value:3},{label:`Running`,value:2},{label:`Blocked`,value:1}]}},o={title:`Jovie/Components/ChatOpsDataCard`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-full max-w-3xl`,children:(0,i.jsx)(e,{})})],args:{card:a}},s={},c={args:{summary:`Shipping read complete. 3 queued, 2 running.`}},l={args:{card:{...a,state:`degraded`,observedAt:null,series:null,facts:[{label:`Merge queue`,value:`Not measured`},{label:`Running tasks`,value:`Not measured`}]}}},u=[`Fresh`,`WithSummary`,`DegradedNoSeries`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    summary: 'Shipping read complete. 3 queued, 2 running.'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    card: {
      ...shippingCard,
      state: 'degraded',
      observedAt: null,
      series: null,
      facts: [{
        label: 'Merge queue',
        value: 'Not measured'
      }, {
        label: 'Running tasks',
        value: 'Not measured'
      }]
    }
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as DegradedNoSeries,s as Fresh,c as WithSummary,u as __namedExportsOrder,o as default};