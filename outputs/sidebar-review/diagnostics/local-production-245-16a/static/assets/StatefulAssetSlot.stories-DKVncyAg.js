import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./StatefulAssetSlot-OasHMwef.js";var r,i,a,o,s;function c(){return(c=e((()=>{t(),r={title:`Library/StatefulAssetSlot`,component:n,args:{kind:`artwork`,occupancy:`empty`,cardinality:`single`,acquireMode:`file`,testIdPrefix:`library-artwork`,objectTitle:`Artwork attached`,acquireLabel:`Drop artwork`,accept:`image/jpeg`,disabled:!1,onFile:()=>void 0}},i={},a={args:{occupancy:`populated`,previewSrc:`https://cdn.example.com/a.jpg`}},o={args:{kind:`stems`,occupancy:`populated`,cardinality:`multi`,acquireMode:`action`,testIdPrefix:`library-stems`,objectTitle:`2 stem files`,acquireLabel:`Add stems`,addHref:`/app/releases/release-1/downloads`,onFile:void 0}},s=[`EmptyArtwork`,`PopulatedArtwork`,`PopulatedStems`],i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{}`,...i.parameters?.docs?.source}}},a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    occupancy: 'populated',
    previewSrc: 'https://cdn.example.com/a.jpg'
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    kind: 'stems',
    occupancy: 'populated',
    cardinality: 'multi',
    acquireMode: 'action',
    testIdPrefix: 'library-stems',
    objectTitle: '2 stem files',
    acquireLabel: 'Add stems',
    addHref: '/app/releases/release-1/downloads',
    onFile: undefined
  }
}`,...o.parameters?.docs?.source}}}})))()}c();export{i as EmptyArtwork,a as PopulatedArtwork,o as PopulatedStems,s as __namedExportsOrder,r as default};