import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DemoStatusIcon-CRiCO1Ai.js";var i,a,o,s;function c(){return(c=e((()=>{i=t(),n(),a={title:`Features/Demo/DemoStatusIcon`,component:r,parameters:{layout:`centered`}},o={args:{status:`live`},render:()=>(0,i.jsx)(`div`,{className:`flex gap-3`,children:[`live`,`syncing`,`scheduled`,`draft`,`archived`].map(e=>(0,i.jsx)(r,{status:e},e))})},s=[`AllStatuses`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'live'
  },
  render: () => <div className='flex gap-3'>
      {(['live', 'syncing', 'scheduled', 'draft', 'archived'] as const).map(status => <DemoStatusIcon key={status} status={status} />)}
    </div>
}`,...o.parameters?.docs?.source}}}})))()}c();export{o as AllStatuses,s as __namedExportsOrder,a as default};