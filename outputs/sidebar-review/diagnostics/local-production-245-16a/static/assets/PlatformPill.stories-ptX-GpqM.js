import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./PlatformPill-uVZd5vJ9.js";var i,a,o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{i=t(),n(),a={title:`Dashboard/Atoms/PlatformPill`,component:r,parameters:{layout:`centered`},args:{platformIcon:`spotify`,platformName:`Spotify`,primaryText:`Spotify`,secondaryText:`artist.spotify.com/12345`,state:`connected`},argTypes:{state:{control:`select`,options:[`connected`,`ready`,`error`,`hidden`,`loading`]},tone:{control:`select`,options:[`default`,`faded`]}}},o={},s={args:{state:`ready`,secondaryText:`Not yet connected`}},c={args:{state:`error`,secondaryText:`Connection failed`}},l={args:{tone:`faded`}},u={args:{collapsed:!0}},d={args:{onClick:()=>{}}},f={args:{badgeText:`New`,trailing:(0,i.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`2.3M`})}},p={render:()=>(0,i.jsxs)(`div`,{className:`flex`,children:[(0,i.jsx)(r,{platformIcon:`spotify`,platformName:`Spotify`,primaryText:`Spotify`,stackable:!0,defaultExpanded:!0}),(0,i.jsx)(r,{platformIcon:`apple-music`,platformName:`Apple Music`,primaryText:`Apple Music`,stackable:!0}),(0,i.jsx)(r,{platformIcon:`youtube`,platformName:`YouTube`,primaryText:`YouTube`,stackable:!0})]})},m=[`Connected`,`Ready`,`ErrorState`,`Faded`,`Collapsed`,`Interactive`,`WithBadgeAndTrailing`,`Stacked`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    state: 'ready',
    secondaryText: 'Not yet connected'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    state: 'error',
    secondaryText: 'Connection failed'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    tone: 'faded'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    collapsed: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    onClick: () => {}
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    badgeText: 'New',
    trailing: <span className='text-xs text-tertiary-token'>2.3M</span>
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex'>
      <PlatformPill platformIcon='spotify' platformName='Spotify' primaryText='Spotify' stackable defaultExpanded />
      <PlatformPill platformIcon='apple-music' platformName='Apple Music' primaryText='Apple Music' stackable />
      <PlatformPill platformIcon='youtube' platformName='YouTube' primaryText='YouTube' stackable />
    </div>
}`,...p.parameters?.docs?.source}}}})))()}h();export{u as Collapsed,o as Connected,c as ErrorState,l as Faded,d as Interactive,s as Ready,p as Stacked,f as WithBadgeAndTrailing,m as __namedExportsOrder,a as default};