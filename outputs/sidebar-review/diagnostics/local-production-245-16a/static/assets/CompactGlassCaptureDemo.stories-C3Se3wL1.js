import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,r}from"./captureShared-DRmf1KRE.js";import{n as i,t as a}from"./MarketingPageShell-6BRzGJWm.js";import{n as o,t as s}from"./artistProfileCopy-j-Y_pNlk.js";import{n as c,t as l}from"./CompactGlassModule-5z-Jfgtr.js";import{n as u,t as d}from"./CompactGlassCaptureDemo-B1JQJwmh.js";var f,p,m,h,g,_,v,y,b;function x(){return(x=e((()=>{f=t(),o(),i(),u(),c(),n(),p={title:`Marketing/ArtistProfile/CompactGlassCaptureDemo`,component:d,parameters:{layout:`fullscreen`,backgrounds:{default:`dark`},jovie:{uncoveredProps:[`capture`,`initialPhase`,`autoPlay`,`className`]}},decorators:[e=>(0,f.jsx)(a,{className:`min-h-screen bg-page`,children:(0,f.jsx)(`div`,{className:`mx-auto flex w-full max-w-96 flex-col px-6 py-16`,children:(0,f.jsx)(e,{})})})]},m={},h={args:{autoPlay:!0}},g={args:{initialPhase:`done`}},_={render:()=>(0,f.jsx)(l,{children:(0,f.jsx)(`div`,{className:`compact-glass-module__demo`,children:(0,f.jsx)(r,{capture:s.capture,phase:`done`})})})},v={args:{initialPhase:`done`,label:s.capture.body,capture:{...s.capture,action:{...s.capture.action,confirmedLabel:s.capture.subhead}}}},y={render:()=>(0,f.jsx)(l,{children:(0,f.jsxs)(`div`,{className:`compact-glass-module__demo`,children:[(0,f.jsx)(r,{capture:s.capture,phase:`idle`}),(0,f.jsx)(`p`,{className:`compact-glass-module__status`,children:`Demo preview — the live demo needs JavaScript; nothing is sent or stored.`})]})})},b=[`Interactive`,`ScriptedPlayback`,`Resettable`,`Static`,`LongContent`,`Fallback`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source},description:{story:`Interactive default: press Play to run the isolated opt-in demo.`,...m.parameters?.docs?.description}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    autoPlay: true
  }
}`,...h.parameters?.docs?.source},description:{story:`Scripted playback — same state machine, started automatically.`,...h.parameters?.docs?.description}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    initialPhase: 'done'
  }
}`,...g.parameters?.docs?.source},description:{story:`Confirmed state offers Reset, which returns the demo to idle.`,...g.parameters?.docs?.description}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <CompactGlassModule>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='done' />
      </div>
    </CompactGlassModule>
}`,..._.parameters?.docs?.source},description:{story:`Still-capture state: the module with the confirmed pill, no controls.`,..._.parameters?.docs?.description}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    initialPhase: 'done',
    label: ARTIST_PROFILE_COPY.capture.body,
    capture: {
      ...ARTIST_PROFILE_COPY.capture,
      action: {
        ...ARTIST_PROFILE_COPY.capture.action,
        confirmedLabel: ARTIST_PROFILE_COPY.capture.subhead
      }
    }
  }
}`,...v.parameters?.docs?.source},description:{story:`Long labels wrap instead of clipping the module (real fixture copy).`,...v.parameters?.docs?.description}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  render: () => <CompactGlassModule>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='idle' />
        <p className='compact-glass-module__status'>
          Demo preview — the live demo needs JavaScript; nothing is sent or
          stored.
        </p>
      </div>
    </CompactGlassModule>
}`,...y.parameters?.docs?.source},description:{story:`No-JS / failed-hydration fallback: useful static content remains.`,...y.parameters?.docs?.description}}}})))()}x();export{y as Fallback,m as Interactive,v as LongContent,g as Resettable,h as ScriptedPlayback,_ as Static,b as __namedExportsOrder,p as default};