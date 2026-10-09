import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./copy-Ak4aYcMX.js";import{n as i,t as a}from"./eye-CladS-wW.js";import{i as o,t as s}from"./TableContextMenu-BtPuWAgQ.js";var c,l,u,d,f;function p(){return(p=e((()=>{c=t(),n(),i(),o(),l={title:`Organisms/Table/TableContextMenu`,component:s,parameters:{layout:`centered`}},u={args:{searchable:!0,searchPlaceholder:`Search actions`,searchMode:`recursive`,items:[{id:`visibility`,label:`Visibility`,icon:(0,c.jsx)(a,{className:`h-3.5 w-3.5`}),items:[{id:`shown`,label:`Shown on Profile`,onClick:()=>void 0}]},{id:`copy`,label:`Copy`,icon:(0,c.jsx)(r,{className:`h-3.5 w-3.5`}),onClick:()=>void 0}],children:(0,c.jsx)(`div`,{className:`rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token`,children:`Right-click this row`})}},d={args:{disabled:!0,items:[{id:`copy`,label:`Copy`,onClick:()=>void 0}],children:(0,c.jsx)(`div`,{className:`rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token`,children:`Context actions unavailable`})}},f=[`SearchableRowActions`,`Disabled`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    searchable: true,
    searchPlaceholder: 'Search actions',
    searchMode: 'recursive',
    items: [{
      id: 'visibility',
      label: 'Visibility',
      icon: <Eye className='h-3.5 w-3.5' />,
      items: [{
        id: 'shown',
        label: 'Shown on Profile',
        onClick: () => undefined
      }]
    }, {
      id: 'copy',
      label: 'Copy',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => undefined
    }],
    children: <div className='rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token'>
        Right-click this row
      </div>
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    items: [{
      id: 'copy',
      label: 'Copy',
      onClick: () => undefined
    }],
    children: <div className='rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token'>
        Context actions unavailable
      </div>
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as Disabled,u as SearchableRowActions,f as __namedExportsOrder,l as default};