import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";function i({tabs:e,active:t,onChange:n,className:i,ariaLabel:o=`Drawer sections`}){return(0,a.jsx)(`div`,{className:r(`shrink-0 px-2 pt-2 pb-2`,i),children:(0,a.jsx)(`div`,{role:`tablist`,"aria-label":o,className:`flex items-center gap-0.5 p-0.5 rounded-full bg-(--surface-0)/70 border border-(--app-shell-border)/70`,children:e.map(e=>{let i=t===e.value;return(0,a.jsx)(`button`,{type:`button`,role:`tab`,"aria-selected":i,onClick:()=>n(e.value),className:r(`flex-1 h-7 px-3 rounded-full text-2xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-subtle ease-subtle`,i?`bg-(--surface-2) text-primary-token ring-1 ring-inset ring-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.05)]`:`text-tertiary-token hover:text-primary-token`),children:e.label},e.value)})})})}var a;function o(){return(o=e((()=>{a=t(),n()})))()}var s,c,l;function u(){return(u=e((()=>{o(),s={title:`Shell/DrawerTabStrip`,component:i,parameters:{layout:`centered`}},c={args:{tabs:[{value:`details`,label:`Details`},{value:`activity`,label:`Activity`}],active:`details`,onChange:()=>{}}},l=[`Default`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    tabs: [{
      value: 'details',
      label: 'Details'
    }, {
      value: 'activity',
      label: 'Activity'
    }],
    active: 'details',
    onChange: () => {}
  }
}`,...c.parameters?.docs?.source}}}})))()}u();export{c as Default,l as __namedExportsOrder,s as default};