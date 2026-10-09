import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./ToolbarFilterSuggestions-DKiBmlhF.js";function a(){let[e,t]=(0,s.useState)(null);return(0,o.jsxs)(`div`,{className:`grid gap-3`,children:[(0,o.jsxs)(`div`,{className:`group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2`,children:[(0,o.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`Filter button`}),(0,o.jsx)(i,{suggestions:l.map(e=>({...e,onSelect:()=>t(e.label)}))})]}),(0,o.jsxs)(`p`,{className:`text-xs text-tertiary-token`,children:[`Applied:`,` `,(0,o.jsx)(`span`,{className:`text-primary-token`,children:e??`none yet`})]})]})}var o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{o=n(),s=t(),r(),{fn:c}=__STORYBOOK_MODULE_TEST__,l=[{id:`type-releases`,label:`Type · Releases`,onSelect:c()},{id:`status-draft`,label:`Status · Draft`,onSelect:c()},{id:`approval-needs-review`,label:`Approval · Needs Review`,onSelect:c()}],u={title:`Organisms/Table/ToolbarFilterSuggestions`,component:i,parameters:{layout:`padded`},tags:[`autodocs`],args:{suggestions:l}},d={name:`Revealed on hover/focus`,render:e=>(0,o.jsxs)(`div`,{className:`group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2`,children:[(0,o.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`Filter button`}),(0,o.jsx)(i,{...e,"data-testid":`suggestions-story`})]})},f={name:`Hidden while filter dropdown is open`,args:{...u.args,hidden:!0},render:e=>(0,o.jsxs)(`div`,{className:`group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2`,children:[(0,o.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`Filter button (open)`}),(0,o.jsx)(i,{...e,"data-testid":`suggestions-story`})]})},p={name:`Applies a real filter on click`,render:()=>(0,o.jsx)(a,{})},m={args:{suggestions:[]},render:e=>(0,o.jsxs)(`div`,{className:`group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2`,children:[(0,o.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:`Filter button (no suggestions — renders nothing)`}),(0,o.jsx)(i,{...e})]})},h=[`RevealedOnHover`,`HiddenWhileFilterOpen`,`AppliesARealFilter`,`Empty`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  name: 'Revealed on hover/focus',
  render: args => <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>Filter button</span>
      <ToolbarFilterSuggestions {...args} data-testid='suggestions-story' />
    </div>
}`,...d.parameters?.docs?.source},description:{story:"At rest the row sits at opacity 0 but still reserves its layout space —\nhover or focus the `group/toolbar-filters` wrapper to reveal it.",...d.parameters?.docs?.description}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  name: 'Hidden while filter dropdown is open',
  args: {
    ...meta.args,
    hidden: true
  },
  render: args => <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>Filter button (open)</span>
      <ToolbarFilterSuggestions {...args} data-testid='suggestions-story' />
    </div>
}`,...f.parameters?.docs?.source},description:{story:`Hidden (not unmounted) while the owning filter dropdown is open.`,...f.parameters?.docs?.description}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  name: 'Applies a real filter on click',
  render: () => <InteractiveDemo />
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    suggestions: []
  },
  render: args => <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>
        Filter button (no suggestions — renders nothing)
      </span>
      <ToolbarFilterSuggestions {...args} />
    </div>
}`,...m.parameters?.docs?.source}}}})))()}g();export{p as AppliesARealFilter,m as Empty,f as HiddenWhileFilterOpen,d as RevealedOnHover,h as __namedExportsOrder,u as default};