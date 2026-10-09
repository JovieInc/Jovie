import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,o as r}from"./ComboboxOptionItem-dTwhDc1Z.js";import{n as i,t as a}from"./ComboboxDropdown-D7l0mybr.js";var o,s,c,l,u;function d(){return(d=e((()=>{o=t(),r(),i(),s={title:`Organisms/Combobox/ComboboxDropdown`,component:a,parameters:{layout:`centered`}},c={render:()=>(0,o.jsx)(`div`,{className:`relative h-40 w-96 bg-neutral-950 p-4`,children:(0,o.jsx)(n,{value:null,onChange:()=>void 0,children:(0,o.jsx)(a,{listboxId:`loading-results`,isOpen:!0,isLoading:!0,query:`first`,filteredOptions:[]})})})},l={render:()=>(0,o.jsx)(`div`,{className:`relative h-48 w-96 bg-neutral-950 p-4`,children:(0,o.jsx)(n,{value:null,onChange:()=>void 0,children:(0,o.jsx)(a,{listboxId:`empty-results`,isOpen:!0,isLoading:!1,query:`missing`,filteredOptions:[]})})})},u=[`Loading`,`NoResults`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='relative h-40 w-96 bg-neutral-950 p-4'>
      <HeadlessCombobox value={null} onChange={() => undefined}>
        <ComboboxDropdown listboxId='loading-results' isOpen isLoading query='first' filteredOptions={[]} />
      </HeadlessCombobox>
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='relative h-48 w-96 bg-neutral-950 p-4'>
      <HeadlessCombobox value={null} onChange={() => undefined}>
        <ComboboxDropdown listboxId='empty-results' isOpen isLoading={false} query='missing' filteredOptions={[]} />
      </HeadlessCombobox>
    </div>
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Loading,l as NoResults,u as __namedExportsOrder,s as default};