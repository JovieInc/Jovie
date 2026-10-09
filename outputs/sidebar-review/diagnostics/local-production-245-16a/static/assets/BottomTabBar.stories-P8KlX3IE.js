import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./BottomTabBar-b_GYDJZO.js";var a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{a=n(),o=t(),r(),{fn:s}=__STORYBOOK_MODULE_TEST__,c={title:`Profile/Navigation/BottomTabBar`,component:i,parameters:{layout:`fullscreen`,jovie:{uncoveredProps:[`activeIndex`,`columnCount`,`reducedMotion`]}},decorators:[e=>(0,a.jsx)(`div`,{className:`flex min-h-svh items-end justify-center bg-surface-0 px-4`,children:(0,a.jsx)(`div`,{className:`w-full max-w-sm`,children:(0,a.jsx)(e,{})})})],args:{activeTab:`profile`,hasTourDates:!0,showAlerts:!0,isMenuOpen:!1,onTabSelect:s(),showAlertsTab:!0}},l={},u={args:{activeTab:`listen`}},d={args:{isMenuOpen:!0}},f={render:function(e){let[t,n]=(0,o.useState)(e.activeTab);return(0,a.jsx)(i,{...e,activeTab:t,onTabSelect:t=>{n(t),e.onTabSelect(t)}})}},p=[`ProfileActive`,`MusicActive`,`MenuOpen`,`Interactive`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    activeTab: 'listen'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    isMenuOpen: true
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: function InteractiveBottomTabBar(args) {
    const [activeTab, setActiveTab] = useState(args.activeTab);
    return <BottomTabBar {...args} activeTab={activeTab} onTabSelect={mode => {
      setActiveTab(mode);
      args.onTabSelect(mode);
    }} />;
  }
}`,...f.parameters?.docs?.source},description:{story:`Tap between tabs to feel the shared lens spring and the glyph press.`,...f.parameters?.docs?.description}}}})))()}m();export{f as Interactive,d as MenuOpen,u as MusicActive,l as ProfileActive,p as __namedExportsOrder,c as default};