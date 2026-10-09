import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./TableFilterDropdown-Dvd2PlI5.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`Molecules/Filters/TableFilterDropdown`,component:r,parameters:{layout:`centered`},args:{categories:[{id:`status`,label:`Status`,iconName:`Hash`,selectedIds:[`active`],onToggle:()=>void 0,options:[{id:`active`,label:`Active`,count:12},{id:`draft`,label:`Draft`,count:3},{id:`released`,label:`Released`,count:28}]},{id:`provider`,label:`Provider`,iconName:`Globe`,selectedIds:[],onToggle:()=>void 0,options:[{id:`spotify`,label:`Spotify`,count:20},{id:`apple_music`,label:`Apple Music`,count:18},{id:`youtube`,label:`YouTube`,count:14},{id:`soundcloud`,label:`SoundCloud`,count:6}]}],headerLabel:`Filter Releases`}},o=async({canvasElement:e})=>{e.querySelector(`button[aria-pressed]`)?.dispatchEvent(new PointerEvent(`pointerdown`,{bubbles:!0,button:0,ctrlKey:!1,pointerType:`mouse`}))},s={render:e=>(0,i.jsx)(r,{...e}),play:o},c={args:{categories:[],emptyMessage:`No filters found`},render:e=>(0,i.jsx)(r,{...e}),play:o},l=[`Default`,`Empty`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: args => <TableFilterDropdown {...args} />,
  play: openMenu
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    categories: [],
    emptyMessage: 'No filters found'
  },
  render: args => <TableFilterDropdown {...args} />,
  play: openMenu
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as Default,c as Empty,l as __namedExportsOrder,a as default};