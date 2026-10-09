import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./release-actions-BZZoGxQ4.js";function i({items:e}){return(0,a.jsx)(`ul`,{className:`w-64 rounded-lg border border-subtle bg-surface-1 p-1 text-app`,children:e.map((e,t)=>`type`in e?(0,a.jsx)(`li`,{className:`my-1 h-px bg-subtle`},`separator-${t}`):(0,a.jsxs)(`li`,{className:`destructive`in e&&e.destructive?`text-destructive`:`text-secondary-token`,children:[e.label,`items`in e&&e.items?` →`:``]},e.id))})}var a,o,s,c,l,u;function d(){return(d=e((()=>{a=t(),n(),o={profileId:`profile-1`,id:`release-1`,title:`Skyline Dreams`,slug:`skyline-dreams`,status:`released`,releaseType:`single`,isExplicit:!1,releaseDate:`2026-01-01`,artworkUrl:void 0,totalTracks:1,providers:[{key:`spotify`,url:`https://open.spotify.com/album/1`,source:`ingested`,updatedAt:`2026-01-01T00:00:00.000Z`,label:`Spotify`,path:`/album/1`,isPrimary:!0}],spotifyPopularity:null,smartLinkPath:`/smart/release-1`,previewUrl:null,primaryIsrc:`US-ABC-26-00001`,upc:null},s={title:`Dashboard/Organisms/Releases/release-actions`,parameters:{layout:`padded`}},c={render:()=>(0,a.jsx)(i,{items:r({release:o,onEdit:()=>{},onCopy:async()=>{},onDelete:()=>{},onChangeStatus:()=>{}})})},l={render:()=>(0,a.jsx)(i,{items:r({release:o,onEdit:()=>{},onCopy:async()=>{},isSmartLinkLocked:()=>!0,getSmartLinkLockReason:()=>`cap`})})},u=[`FullMenu`,`SmartLinkLocked`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <MenuItemsPreview items={buildReleaseActions({
    release,
    onEdit: () => {},
    onCopy: async () => {},
    onDelete: () => {},
    onChangeStatus: () => {}
  })} />
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <MenuItemsPreview items={buildReleaseActions({
    release,
    onEdit: () => {},
    onCopy: async () => {},
    isSmartLinkLocked: () => true,
    getSmartLinkLockReason: () => 'cap'
  })} />
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as FullMenu,l as SmartLinkLocked,u as __namedExportsOrder,s as default};