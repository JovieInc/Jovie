import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,r as i}from"./UserButton-BkGsA1t7.js";function a({icon:e}){return!(typeof e==`function`||typeof e==`object`&&e&&`$$typeof`in e)||(0,c.isValidElement)(e)?e:(0,s.jsx)(e,{className:`h-4 w-4`})}function o({state:e}){let t=r(e,()=>void 0);return(0,s.jsx)(`div`,{className:`w-80 rounded-xl border border-subtle bg-surface-1 p-1`,children:t.length===0?(0,s.jsx)(`p`,{className:`px-2.5 py-1.5 text-2xs text-tertiary-token`,children:`Menu item hidden`}):t.map(e=>e.type===`action`?(0,s.jsxs)(`div`,{className:`flex h-7 items-center gap-2.5 rounded-md px-2.5 text-app text-primary-token`,children:[(0,s.jsx)(a,{icon:e.icon}),e.label]},e.id):(0,s.jsx)(`div`,{className:`-mx-1 my-0 h-2`},e.id))})}var s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{s=n(),c=t(),i(),l={title:`Organisms/DesktopUpdateMenuItem`,component:o,parameters:{layout:`centered`}},u={args:{state:{state:`available`,version:`26.9.16`,releaseDate:null,notesUrl:`https://jov.ie/changelog`}}},d={args:{state:{state:`downloading`,percent:42,transferredBytes:1,totalBytes:2,bytesPerSecond:1}}},f={args:{state:{state:`ready`,version:`26.9.16`}}},p={args:{state:{state:`error`,message:`offline`,retryable:!0}}},m={args:{state:{state:`idle`}}},h={...u,parameters:{themes:{themeOverride:`light`}}},g={...f,parameters:{themes:{themeOverride:`light`}}},_=[`Available`,`Downloading`,`Ready`,`ErrorState`,`HiddenWhenIdle`,`AvailableLight`,`ReadyLight`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'available',
      version: '26.9.16',
      releaseDate: null,
      notesUrl: 'https://jov.ie/changelog'
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'downloading',
      percent: 42,
      transferredBytes: 1,
      totalBytes: 2,
      bytesPerSecond: 1
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'ready',
      version: '26.9.16'
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'error',
      message: 'offline',
      retryable: true
    }
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'idle'
    }
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  ...Available,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  ...Ready,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{u as Available,h as AvailableLight,d as Downloading,p as ErrorState,m as HiddenWhenIdle,f as Ready,g as ReadyLight,_ as __namedExportsOrder,l as default};