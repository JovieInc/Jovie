import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./copy-Ak4aYcMX.js";import{n as a,t as o}from"./layout-grid-BBbaGN5U.js";import{n as s,t as c}from"./layout-list-BLwNjkab.js";import{n as l,t as u}from"./pencil-wXa6-Cfc.js";import{n as d,t as f}from"./search-Binh2gA_.js";import{n as p,t as m}from"./settings-2-Bq7xalIT.js";import{n as h,t as g}from"./trash-DM9Ayg-e.js";import{n as _,t as v}from"./user-Dl3uAoYs.js";import{n as y,t as b}from"./common-dropdown-CkbgKmra.js";var x,S,C,w,T,E,D,O,k,A,j,M,N,P,F,I,L,R,z;function B(){return(B=e((()=>{x=n(),r(),a(),s(),l(),d(),p(),h(),_(),S=t(),y(),C={title:`UI/Atoms/CommonDropdown`,component:b,parameters:{layout:`centered`},tags:[`autodocs`]},w={args:{variant:`dropdown`,items:[{type:`action`,id:`edit`,label:`Edit`,icon:u,onClick:()=>console.log(`Edit clicked`)},{type:`action`,id:`duplicate`,label:`Duplicate`,icon:i,onClick:()=>console.log(`Duplicate clicked`)},{type:`separator`,id:`sep-1`},{type:`action`,id:`delete`,label:`Delete`,icon:g,onClick:()=>console.log(`Delete clicked`),variant:`destructive`}]}},T={args:{items:Array.from({length:13},(e,t)=>({type:`action`,id:`destination-${t}`,label:`Destination ${t+1}`,onClick:()=>void 0}))}},E={args:{items:[{type:`submenu`,id:`share`,label:`Share`,items:[{type:`submenu`,id:`export`,label:`Export`,items:[{type:`action`,id:`csv`,label:`CSV`,onClick:()=>void 0}]}]}]}},D={args:{variant:`dropdown`,items:[{type:`action`,id:`edit`,label:`Edit`,icon:u,onClick:()=>console.log(`Edit clicked`),shortcut:`⌘E`},{type:`action`,id:`copy`,label:`Copy ID`,icon:i,onClick:()=>console.log(`Copy clicked`),subText:`usr_123`,badge:{text:`NEW`,color:`#7c3aed`}},{type:`separator`,id:`sep-1`},{type:`action`,id:`delete`,label:`Delete permanently`,icon:g,onClick:()=>console.log(`Delete clicked`),variant:`destructive`,shortcut:`⌘⌫`}]}},O={render:()=>{let[e,t]=(0,S.useState)({email:!0,phone:!1,address:!0,notes:!1});return(0,x.jsx)(b,{variant:`dropdown`,trigger:(0,x.jsxs)(`button`,{type:`button`,className:`inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token`,children:[(0,x.jsx)(m,{className:`h-4 w-4`}),`Columns`]}),items:[{type:`label`,id:`label-1`,label:`Show columns`},{type:`checkbox`,id:`email`,label:`Email`,checked:e.email,onCheckedChange:n=>t({...e,email:n})},{type:`checkbox`,id:`phone`,label:`Phone`,checked:e.phone,onCheckedChange:n=>t({...e,phone:n})},{type:`checkbox`,id:`address`,label:`Address`,checked:e.address,onCheckedChange:n=>t({...e,address:n})},{type:`checkbox`,id:`notes`,label:`Notes`,checked:e.notes,onCheckedChange:n=>t({...e,notes:n})}]})}},k={render:()=>{let[e,t]=(0,S.useState)(`list`);return(0,x.jsx)(b,{variant:`dropdown`,trigger:(0,x.jsxs)(`button`,{type:`button`,className:`inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token`,children:[(0,x.jsx)(m,{className:`h-4 w-4`}),`View: `,e]}),items:[{type:`label`,id:`label-1`,label:`View mode`},{type:`radio`,id:`view-mode`,value:e,onValueChange:t,items:[{id:`list`,value:`list`,label:`List`,icon:c},{id:`board`,value:`board`,label:`Board`,icon:o}]}]})}},A={render:()=>{let[e,t]=(0,S.useState)(`list`),[n,r]=(0,S.useState)({email:!0,phone:!1,address:!0});return(0,x.jsx)(b,{variant:`dropdown`,trigger:(0,x.jsxs)(`button`,{type:`button`,className:`inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token`,children:[(0,x.jsx)(m,{className:`h-4 w-4`}),`Display`]}),contentClassName:`w-56`,items:[{type:`label`,id:`view-label`,label:`View mode`},{type:`radio`,id:`view-mode`,value:e,onValueChange:t,items:[{id:`list`,value:`list`,label:`List`,icon:c},{id:`board`,value:`board`,label:`Board`,icon:o}]},{type:`separator`,id:`sep-1`},{type:`label`,id:`columns-label`,label:`Show columns`},{type:`checkbox`,id:`email`,label:`Email`,checked:n.email,onCheckedChange:e=>r({...n,email:e})},{type:`checkbox`,id:`phone`,label:`Phone`,checked:n.phone,onCheckedChange:e=>r({...n,phone:e})},{type:`checkbox`,id:`address`,label:`Address`,checked:n.address,onCheckedChange:e=>r({...n,address:e})}]})}},j={args:{variant:`dropdown`,items:[{type:`action`,id:`edit`,label:`Edit`,icon:u,onClick:()=>console.log(`Edit clicked`)},{type:`submenu`,id:`copy`,label:`Copy`,icon:i,items:[{type:`action`,id:`copy-id`,label:`Copy ID`,onClick:()=>console.log(`Copy ID`)},{type:`action`,id:`copy-name`,label:`Copy Name`,onClick:()=>console.log(`Copy Name`)},{type:`action`,id:`copy-email`,label:`Copy Email`,onClick:()=>console.log(`Copy Email`)}]},{type:`separator`,id:`sep-1`},{type:`action`,id:`delete`,label:`Delete`,icon:g,onClick:()=>console.log(`Delete clicked`),variant:`destructive`}]}},M={render:()=>(0,x.jsx)(b,{variant:`context`,items:[{type:`action`,id:`edit`,label:`Edit`,icon:u,onClick:()=>console.log(`Edit clicked`)},{type:`action`,id:`duplicate`,label:`Duplicate`,icon:i,onClick:()=>console.log(`Duplicate clicked`)},{type:`separator`,id:`sep-1`},{type:`action`,id:`delete`,label:`Delete`,icon:g,onClick:()=>console.log(`Delete clicked`),variant:`destructive`}],children:(0,x.jsx)(`div`,{className:`flex h-32 w-64 items-center justify-center rounded-lg border-2 border-dashed border-subtle bg-surface-1 text-sm text-secondary-token`,children:`Right-click me`})})},N={args:{variant:`dropdown`,searchable:!0,searchPlaceholder:`Search actions...`,items:[{type:`action`,id:`1`,label:`Apple`,onClick:()=>console.log(`Apple`)},{type:`action`,id:`2`,label:`Banana`,onClick:()=>console.log(`Banana`)},{type:`action`,id:`3`,label:`Cherry`,onClick:()=>console.log(`Cherry`)},{type:`action`,id:`4`,label:`Date`,onClick:()=>console.log(`Date`)},{type:`action`,id:`5`,label:`Elderberry`,onClick:()=>console.log(`Elderberry`)},{type:`action`,id:`6`,label:`Fig`,onClick:()=>console.log(`Fig`)},{type:`action`,id:`7`,label:`Grape`,onClick:()=>console.log(`Grape`)}]}},P={args:{variant:`dropdown`,isLoading:!0,items:[]}},F={args:{variant:`dropdown`,emptyMessage:`No actions available`,items:[]}},I={args:{variant:`dropdown`,trigger:(0,x.jsxs)(`button`,{type:`button`,className:`inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover`,children:[(0,x.jsx)(v,{className:`h-4 w-4`}),`Actions`]}),items:[{type:`action`,id:`edit`,label:`Edit Profile`,icon:u,onClick:()=>console.log(`Edit clicked`)},{type:`action`,id:`settings`,label:`Settings`,icon:m,onClick:()=>console.log(`Settings clicked`)},{type:`separator`,id:`sep-1`},{type:`action`,id:`delete`,label:`Delete Account`,icon:g,onClick:()=>console.log(`Delete clicked`),variant:`destructive`}]}},L={args:{variant:`dropdown`,disabled:!0,items:[{type:`action`,id:`edit`,label:`Edit`,icon:u,onClick:()=>console.log(`Edit clicked`)}]}},R={args:{variant:`dropdown`,items:[{type:`action`,id:`spotify`,label:`Spotify`,icon:(0,x.jsx)(`div`,{className:`flex h-5 w-5 items-center justify-center rounded`,style:{backgroundColor:`#1DB954`,color:`#fff`},children:(0,x.jsx)(f,{className:`h-3 w-3`})}),onClick:()=>console.log(`Spotify clicked`)},{type:`action`,id:`apple`,label:`Apple Music`,icon:(0,x.jsx)(`div`,{className:`flex h-5 w-5 items-center justify-center rounded`,style:{backgroundColor:`#FA243C`,color:`#fff`},children:(0,x.jsx)(f,{className:`h-3 w-3`})}),onClick:()=>console.log(`Apple Music clicked`)}]}},z=[`SimpleActionMenu`,`LargeActionChooser`,`DeepActionChooser`,`AdvancedActionMenu`,`WithCheckboxes`,`WithRadioGroup`,`ComplexDisplayMenu`,`WithSubmenus`,`ContextMenuVariant`,`SearchableDropdown`,`LoadingState`,`EmptyState`,`CustomTrigger`,`DisabledDropdown`,`WithCustomIconRendering`],w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    items: [{
      type: 'action',
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => console.log('Edit clicked')
    }, {
      type: 'action',
      id: 'duplicate',
      label: 'Duplicate',
      icon: Copy,
      onClick: () => console.log('Duplicate clicked')
    }, {
      type: 'separator',
      id: 'sep-1'
    }, {
      type: 'action',
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => console.log('Delete clicked'),
      variant: 'destructive'
    }]
  }
}`,...w.parameters?.docs?.source},description:{story:`Simple action menu with edit and delete options`,...w.parameters?.docs?.description}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    items: Array.from({
      length: 13
    }, (_, index) => ({
      type: 'action' as const,
      id: \`destination-\${index}\`,
      label: \`Destination \${index + 1}\`,
      onClick: () => undefined
    }))
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    items: [{
      type: 'submenu',
      id: 'share',
      label: 'Share',
      items: [{
        type: 'submenu',
        id: 'export',
        label: 'Export',
        items: [{
          type: 'action',
          id: 'csv',
          label: 'CSV',
          onClick: () => undefined
        }]
      }]
    }]
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    items: [{
      type: 'action',
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => console.log('Edit clicked'),
      shortcut: '⌘E'
    }, {
      type: 'action',
      id: 'copy',
      label: 'Copy ID',
      icon: Copy,
      onClick: () => console.log('Copy clicked'),
      subText: 'usr_123',
      badge: {
        text: 'NEW',
        color: '#7c3aed'
      }
    }, {
      type: 'separator',
      id: 'sep-1'
    }, {
      type: 'action',
      id: 'delete',
      label: 'Delete permanently',
      icon: Trash2,
      onClick: () => console.log('Delete clicked'),
      variant: 'destructive',
      shortcut: '⌘⌫'
    }]
  }
}`,...D.parameters?.docs?.source},description:{story:`Action menu with badges, subtext, and shortcuts`,...D.parameters?.docs?.description}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  render: () => {
    const [visibility, setVisibility] = useState({
      email: true,
      phone: false,
      address: true,
      notes: false
    });
    return <CommonDropdown variant='dropdown' trigger={<button type='button' className='inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'>
            <Settings2 className='h-4 w-4' />
            Columns
          </button>} items={[{
      type: 'label',
      id: 'label-1',
      label: 'Show columns'
    }, {
      type: 'checkbox',
      id: 'email',
      label: 'Email',
      checked: visibility.email,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        email: checked
      })
    }, {
      type: 'checkbox',
      id: 'phone',
      label: 'Phone',
      checked: visibility.phone,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        phone: checked
      })
    }, {
      type: 'checkbox',
      id: 'address',
      label: 'Address',
      checked: visibility.address,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        address: checked
      })
    }, {
      type: 'checkbox',
      id: 'notes',
      label: 'Notes',
      checked: visibility.notes,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        notes: checked
      })
    }]} />;
  }
}`,...O.parameters?.docs?.source},description:{story:`Dropdown with checkbox items for column visibility`,...O.parameters?.docs?.description}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  render: () => {
    const [viewMode, setViewMode] = useState('list');
    return <CommonDropdown variant='dropdown' trigger={<button type='button' className='inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'>
            <Settings2 className='h-4 w-4' />
            View: {viewMode}
          </button>} items={[{
      type: 'label',
      id: 'label-1',
      label: 'View mode'
    }, {
      type: 'radio',
      id: 'view-mode',
      value: viewMode,
      onValueChange: setViewMode,
      items: [{
        id: 'list',
        value: 'list',
        label: 'List',
        icon: LayoutList
      }, {
        id: 'board',
        value: 'board',
        label: 'Board',
        icon: LayoutGrid
      }]
    }]} />;
  }
}`,...k.parameters?.docs?.source},description:{story:`Dropdown with radio group for view mode selection`,...k.parameters?.docs?.description}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  render: () => {
    const [viewMode, setViewMode] = useState('list');
    const [visibility, setVisibility] = useState({
      email: true,
      phone: false,
      address: true
    });
    return <CommonDropdown variant='dropdown' trigger={<button type='button' className='inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'>
            <Settings2 className='h-4 w-4' />
            Display
          </button>} contentClassName='w-56' items={[{
      type: 'label',
      id: 'view-label',
      label: 'View mode'
    }, {
      type: 'radio',
      id: 'view-mode',
      value: viewMode,
      onValueChange: setViewMode,
      items: [{
        id: 'list',
        value: 'list',
        label: 'List',
        icon: LayoutList
      }, {
        id: 'board',
        value: 'board',
        label: 'Board',
        icon: LayoutGrid
      }]
    }, {
      type: 'separator',
      id: 'sep-1'
    }, {
      type: 'label',
      id: 'columns-label',
      label: 'Show columns'
    }, {
      type: 'checkbox',
      id: 'email',
      label: 'Email',
      checked: visibility.email,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        email: checked
      })
    }, {
      type: 'checkbox',
      id: 'phone',
      label: 'Phone',
      checked: visibility.phone,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        phone: checked
      })
    }, {
      type: 'checkbox',
      id: 'address',
      label: 'Address',
      checked: visibility.address,
      onCheckedChange: checked => setVisibility({
        ...visibility,
        address: checked
      })
    }]} />;
  }
}`,...A.parameters?.docs?.source},description:{story:`Complex dropdown with mixed item types (like DisplayMenuDropdown)`,...A.parameters?.docs?.description}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    items: [{
      type: 'action',
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => console.log('Edit clicked')
    }, {
      type: 'submenu',
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      items: [{
        type: 'action',
        id: 'copy-id',
        label: 'Copy ID',
        onClick: () => console.log('Copy ID')
      }, {
        type: 'action',
        id: 'copy-name',
        label: 'Copy Name',
        onClick: () => console.log('Copy Name')
      }, {
        type: 'action',
        id: 'copy-email',
        label: 'Copy Email',
        onClick: () => console.log('Copy Email')
      }]
    }, {
      type: 'separator',
      id: 'sep-1'
    }, {
      type: 'action',
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => console.log('Delete clicked'),
      variant: 'destructive'
    }]
  }
}`,...j.parameters?.docs?.source},description:{story:`Dropdown with nested submenus`,...j.parameters?.docs?.description}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  render: () => <CommonDropdown variant='context' items={[{
    type: 'action',
    id: 'edit',
    label: 'Edit',
    icon: Pencil,
    onClick: () => console.log('Edit clicked')
  }, {
    type: 'action',
    id: 'duplicate',
    label: 'Duplicate',
    icon: Copy,
    onClick: () => console.log('Duplicate clicked')
  }, {
    type: 'separator',
    id: 'sep-1'
  }, {
    type: 'action',
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    onClick: () => console.log('Delete clicked'),
    variant: 'destructive'
  }]}>
      <div className='flex h-32 w-64 items-center justify-center rounded-lg border-2 border-dashed border-subtle bg-surface-1 text-sm text-secondary-token'>
        Right-click me
      </div>
    </CommonDropdown>
}`,...M.parameters?.docs?.source},description:{story:`Context menu (right-click) variant`,...M.parameters?.docs?.description}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    searchable: true,
    searchPlaceholder: 'Search actions...',
    items: [{
      type: 'action',
      id: '1',
      label: 'Apple',
      onClick: () => console.log('Apple')
    }, {
      type: 'action',
      id: '2',
      label: 'Banana',
      onClick: () => console.log('Banana')
    }, {
      type: 'action',
      id: '3',
      label: 'Cherry',
      onClick: () => console.log('Cherry')
    }, {
      type: 'action',
      id: '4',
      label: 'Date',
      onClick: () => console.log('Date')
    }, {
      type: 'action',
      id: '5',
      label: 'Elderberry',
      onClick: () => console.log('Elderberry')
    }, {
      type: 'action',
      id: '6',
      label: 'Fig',
      onClick: () => console.log('Fig')
    }, {
      type: 'action',
      id: '7',
      label: 'Grape',
      onClick: () => console.log('Grape')
    }]
  }
}`,...N.parameters?.docs?.source},description:{story:`Searchable dropdown for filtering long lists`,...N.parameters?.docs?.description}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    isLoading: true,
    items: []
  }
}`,...P.parameters?.docs?.source},description:{story:`Loading state`,...P.parameters?.docs?.description}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    emptyMessage: 'No actions available',
    items: []
  }
}`,...F.parameters?.docs?.source},description:{story:`Empty state with custom message`,...F.parameters?.docs?.description}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    trigger: <button type='button' className='inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover'>
        <User className='h-4 w-4' />
        Actions
      </button>,
    items: [{
      type: 'action',
      id: 'edit',
      label: 'Edit Profile',
      icon: Pencil,
      onClick: () => console.log('Edit clicked')
    }, {
      type: 'action',
      id: 'settings',
      label: 'Settings',
      icon: Settings2,
      onClick: () => console.log('Settings clicked')
    }, {
      type: 'separator',
      id: 'sep-1'
    }, {
      type: 'action',
      id: 'delete',
      label: 'Delete Account',
      icon: Trash2,
      onClick: () => console.log('Delete clicked'),
      variant: 'destructive'
    }]
  }
}`,...I.parameters?.docs?.source},description:{story:`Custom trigger button`,...I.parameters?.docs?.description}}},L.parameters={...L.parameters,docs:{...L.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    disabled: true,
    items: [{
      type: 'action',
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => console.log('Edit clicked')
    }]
  }
}`,...L.parameters?.docs?.source},description:{story:`Disabled dropdown`,...L.parameters?.docs?.description}}},R.parameters={...R.parameters,docs:{...R.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'dropdown',
    items: [{
      type: 'action',
      id: 'spotify',
      label: 'Spotify',
      icon: <div className='flex h-5 w-5 items-center justify-center rounded' style={{
        backgroundColor: '#1DB954',
        color: '#fff'
      }}>
            <Search className='h-3 w-3' />
          </div>,
      onClick: () => console.log('Spotify clicked')
    }, {
      type: 'action',
      id: 'apple',
      label: 'Apple Music',
      icon: <div className='flex h-5 w-5 items-center justify-center rounded' style={{
        backgroundColor: '#FA243C',
        color: '#fff'
      }}>
            <Search className='h-3 w-3' />
          </div>,
      onClick: () => console.log('Apple Music clicked')
    }]
  }
}`,...R.parameters?.docs?.source},description:{story:`Dropdown with custom icon as ReactNode (for colored badges)`,...R.parameters?.docs?.description}}}})))()}B();export{D as AdvancedActionMenu,A as ComplexDisplayMenu,M as ContextMenuVariant,I as CustomTrigger,E as DeepActionChooser,L as DisabledDropdown,F as EmptyState,T as LargeActionChooser,P as LoadingState,N as SearchableDropdown,w as SimpleActionMenu,O as WithCheckboxes,R as WithCustomIconRendering,k as WithRadioGroup,j as WithSubmenus,z as __namedExportsOrder,C as default};