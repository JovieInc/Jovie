import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{d as n,f as r,g as i,p as a,u as o}from"./PageToolbar-CxNLpn7f.js";var s,c,l,u,d,f;function p(){return(p=e((()=>{s=t(),i(),c={title:`Organisms/Table/PageToolbar`,component:o,parameters:{layout:`padded`,jovie:{uncoveredProps:[`disabled`]}}},l={args:{start:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(a,{label:`All`,active:!0}),(0,s.jsx)(a,{label:`Drafts`}),(0,s.jsx)(`span`,{className:`text-xs text-tertiary-token tabular-nums`,children:`12 rows`})]}),end:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(n,{label:`Display`,ariaLabel:`Display options`}),(0,s.jsx)(n,{label:`Disabled`,ariaLabel:`Disabled action`,disabled:!0})]}),"data-testid":`page-toolbar-story`}},u={args:{...l.args,topDivider:!0}},d={args:{start:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(r,{href:`/app/releases`,label:`Releases`,ariaLabel:`Back to releases`}),(0,s.jsx)(`span`,{className:`min-w-0 truncate text-xs text-tertiary-token tabular-nums`,children:`The Deep End release tasks`})]})}},f=[`Default`,`WithTopDivider`,`WithBackLink`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    start: <>
        <PageToolbarTabButton label='All' active />
        <PageToolbarTabButton label='Drafts' />
        <span className='text-xs text-tertiary-token tabular-nums'>
          12 rows
        </span>
      </>,
    end: <>
        <PageToolbarActionButton label='Display' ariaLabel='Display options' />
        <PageToolbarActionButton label='Disabled' ariaLabel='Disabled action' disabled />
      </>,
    'data-testid': 'page-toolbar-story'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    topDivider: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    start: <>
        <PageToolbarBackLink href='/app/releases' label='Releases' ariaLabel='Back to releases' />
        <span className='min-w-0 truncate text-xs text-tertiary-token tabular-nums'>
          The Deep End release tasks
        </span>
      </>
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{l as Default,d as WithBackLink,u as WithTopDivider,f as __namedExportsOrder,c as default};