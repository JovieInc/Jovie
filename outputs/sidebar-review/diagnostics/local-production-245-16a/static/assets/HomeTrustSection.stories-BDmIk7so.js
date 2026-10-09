import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./HomeTrustSection-IeIvVnvL.js";import{n as r,t as i}from"./logo-permissions.fixture-B1uxL_iC.js";var a,o,s,c,l,u;function d(){return(d=e((()=>{r(),t(),a={title:`Marketing/Sections/HomeTrustSection`,component:n,parameters:{layout:`fullscreen`,backgrounds:{default:`dark`},docs:{description:{component:`Canonical trust-logo owner. Renders only logos with an active permission for its placement (JOV-7795); these stories use example grants, not real permissions.`}}},args:{placement:{page:`/`},fixturePermissions:i}},o={},s={args:{presentation:`inline-strip`}},c={args:{presentation:`artist-profile`}},l={args:{fixturePermissions:[]}},u=[`Card`,`InlineStrip`,`ArtistProfile`,`NoPermission`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    presentation: 'inline-strip'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    presentation: 'artist-profile'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    fixturePermissions: []
  }
}`,...l.parameters?.docs?.source},description:{story:`No grant covers the placement, so nothing renders.`,...l.parameters?.docs?.description}}}})))()}d();export{c as ArtistProfile,o as Card,s as InlineStrip,l as NoPermission,u as __namedExportsOrder,a as default};