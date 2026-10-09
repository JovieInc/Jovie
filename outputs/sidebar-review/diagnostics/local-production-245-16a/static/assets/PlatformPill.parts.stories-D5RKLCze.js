import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r,n as i,o as a,r as o,t as s}from"./PlatformPill.parts-DnsYj-ld.js";var c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{c=t(),a(),l={title:`Dashboard/Atoms/PlatformPill.parts`,parameters:{layout:`centered`,docs:{description:{component:`PlatformPill.parts holds the sub-components extracted from PlatformPill to
keep its cognitive complexity down. Storied here directly since they are
not exported from the parent's public API.`}}}},u={render:()=>(0,c.jsx)(o,{platformIcon:`spotify`,style:{color:`#1ed760`}})},d={render:()=>(0,c.jsx)(`div`,{className:`relative h-8 w-32 rounded-full border border-subtle`,children:(0,c.jsx)(r,{show:!0})})},f={render:()=>(0,c.jsx)(`div`,{className:`group/pill flex w-40 items-center rounded-full border border-subtle p-1`,children:(0,c.jsx)(s,{defaultExpanded:!1,primaryText:`Spotify`})})},p={render:()=>(0,c.jsx)(`div`,{className:`w-56 rounded-full border border-subtle p-1`,children:(0,c.jsx)(i,{primaryText:`Spotify`,secondaryText:`artist.spotify.com/12345`,badgeText:`New`})})},m={render:()=>(0,c.jsx)(n,{collapsed:!1,children:(0,c.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`2.3M`})})},h=[`Icon`,`Shimmer`,`Collapsed`,`Expanded`,`Trailing`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <PillIcon platformIcon='spotify' style={{
    color: '#1ed760'
  }} />
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='relative h-8 w-32 rounded-full border border-subtle'>
      <PillShimmer show />
    </div>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='group/pill flex w-40 items-center rounded-full border border-subtle p-1'>
      <CollapsedContent defaultExpanded={false} primaryText='Spotify' />
    </div>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-56 rounded-full border border-subtle p-1'>
      <ExpandedContent primaryText='Spotify' secondaryText='artist.spotify.com/12345' badgeText='New' />
    </div>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <TrailingContent collapsed={false}>
      <span className='text-xs text-tertiary-token'>2.3M</span>
    </TrailingContent>
}`,...m.parameters?.docs?.source}}}})))()}g();export{f as Collapsed,p as Expanded,u as Icon,d as Shimmer,m as Trailing,h as __namedExportsOrder,l as default};