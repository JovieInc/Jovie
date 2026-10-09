import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ChatUploadManifest-CHCyK43X.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{i=t(),n(),a=()=>{},o={id:`story-uploading-audio`,name:`festival-master.wav`,size:486e5,mediaType:`audio/wav`,kind:`audio`,progress:73,speed:12e5,status:`uploading`,kindLabel:`Audio`},s={id:`story-processing-stems`,name:`stems.zip`,size:1264e5,mediaType:`application/zip`,kind:`document`,progress:100,speed:0,status:`processing`,kindLabel:`Archive`},c={id:`story-ready-artwork`,name:`cover-art.png`,size:32e5,mediaType:`image/png`,kind:`image`,progress:100,speed:0,status:`ready`,kindLabel:`Image`},l={id:`story-failed-video`,name:`behind-the-scenes.mov`,size:212e6,mediaType:`video/quicktime`,kind:`video`,progress:42,speed:0,status:`failed`,error:`Upload failed. Try again.`,kindLabel:`Video`},u={id:`story-duplicate-audio`,name:`festival-master-copy.wav`,size:486e5,mediaType:`audio/wav`,kind:`audio`,progress:0,speed:0,status:`duplicate`,kindLabel:`Audio`},d={width:`min(520px, calc(100vw - 32px))`},f={title:`Jovie/Components/ChatUploadManifest`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{style:d,children:(0,i.jsx)(e,{})})]},p={args:{files:[o,s,c],aggregate:{total:3,done:1,overallPct:58,speed:`1.2 MB/s`,eta:`12s`},isUploading:!0,onRemove:a,onCollapse:a}},m={args:{files:[o,c],aggregate:{total:2,done:1,overallPct:50,speed:`1.2 MB/s`,eta:`12s`},isUploading:!0,onRemove:a,collapsed:!0,onExpand:a}},h={args:{files:[l,u,c],aggregate:{total:3,done:1,overallPct:33,speed:`0 B/s`,eta:`Retry needed`},isUploading:!1,onRemove:a}},g={args:{files:[o,c],aggregate:{total:2,done:1,overallPct:50,speed:`1.2 MB/s`,eta:`12s`},isUploading:!0,onRemove:a,lockedCount:2,isPro:!1}},_=[`Uploading`,`Collapsed`,`ErrorAndDuplicate`,`LockedQuota`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    files: [uploadingFile, processingFile, readyFile],
    aggregate: {
      total: 3,
      done: 1,
      overallPct: 58,
      speed: '1.2 MB/s',
      eta: '12s'
    },
    isUploading: true,
    onRemove: noop,
    onCollapse: noop
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    files: [uploadingFile, readyFile],
    aggregate: {
      total: 2,
      done: 1,
      overallPct: 50,
      speed: '1.2 MB/s',
      eta: '12s'
    },
    isUploading: true,
    onRemove: noop,
    collapsed: true,
    onExpand: noop
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    files: [failedFile, duplicateFile, readyFile],
    aggregate: {
      total: 3,
      done: 1,
      overallPct: 33,
      speed: '0 B/s',
      eta: 'Retry needed'
    },
    isUploading: false,
    onRemove: noop
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    files: [uploadingFile, readyFile],
    aggregate: {
      total: 2,
      done: 1,
      overallPct: 50,
      speed: '1.2 MB/s',
      eta: '12s'
    },
    isUploading: true,
    onRemove: noop,
    lockedCount: 2,
    isPro: false
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{m as Collapsed,h as ErrorAndDuplicate,g as LockedQuota,p as Uploading,_ as __namedExportsOrder,f as default};