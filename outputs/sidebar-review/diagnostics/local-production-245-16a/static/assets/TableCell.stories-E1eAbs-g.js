import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r}from"./VirtualizedTableRow-BJi-HEer.js";import{n as i,t as a}from"./tanstack-table-C03_ny4z.js";import{n as o,t as s}from"./UnifiedTable-obLkFdcR.js";import{n as c,t as l}from"./column-renderers-CwFZ5SGp.js";var u,d,f,p,m,h,g,_,v,y,b;function x(){return(x=e((()=>{u=t(),l(),i(),o(),n(),d={title:`Organisms/Table/Atoms/TableCell`,component:r,parameters:{layout:`centered`}},f={args:{children:`Release title`},render:()=>(0,u.jsx)(`table`,{children:(0,u.jsx)(`tbody`,{children:(0,u.jsxs)(`tr`,{children:[(0,u.jsx)(r,{children:`Release title`}),(0,u.jsx)(r,{align:`right`,children:`42`})]})})})},p={args:{children:`Secondary row`},render:()=>(0,u.jsx)(`table`,{children:(0,u.jsx)(`tbody`,{children:(0,u.jsx)(`tr`,{children:(0,u.jsx)(r,{className:`text-secondary-token`,children:`Secondary row`})})})})},m={args:{children:`High`},render:()=>(0,u.jsx)(`table`,{style:{width:320,tableLayout:`fixed`},"data-testid":`inline-badge-table`,children:(0,u.jsx)(`tbody`,{children:[`left`,`center`,`right`].map(e=>(0,u.jsxs)(`tr`,{children:[(0,u.jsx)(r,{align:e,children:(0,u.jsx)(`span`,{"data-testid":`badge-${e}`,className:`inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-medium ring-1 ring-emerald-500/25 ring-inset`,children:`High`})}),(0,u.jsx)(r,{children:`A long email@example.com label that must stay on one line`})]},e))})})},h={id:`creator-geometry`,username:`long_creator_username`,usernameNormalized:`long_creator_username`,displayName:`A long creator display name`,avatarUrl:`/images/avatars/tim-white.jpg`,isVerified:!0,isFeatured:!0,marketingOptOut:!1,isClaimed:!1,claimToken:null,claimTokenExpiresAt:null,userId:null,createdAt:null,ingestionStatus:`idle`,location:null,hometown:null,activeSinceYear:null,lastIngestionError:null},g=[a().accessor(`username`,{header:`Creator`,cell:c})],_={args:{children:null},render:()=>(0,u.jsx)(`div`,{style:{width:320},"data-testid":`creator-identity-table`,children:(0,u.jsx)(s,{data:[h],columns:g,minWidth:`320px`,enableVirtualization:!1})})},v={...m,parameters:{themes:{themeOverride:`light`}}},y={..._,parameters:{themes:{themeOverride:`light`}}},b=[`Default`,`SecondaryTone`,`InlineBadges`,`CreatorIdentity`,`InlineBadgesLight`,`CreatorIdentityLight`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Release title'
  },
  render: () => <table>
      <tbody>
        <tr>
          <TableCell>Release title</TableCell>
          <TableCell align='right'>42</TableCell>
        </tr>
      </tbody>
    </table>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Secondary row'
  },
  render: () => <table>
      <tbody>
        <tr>
          <TableCell className='text-secondary-token'>Secondary row</TableCell>
        </tr>
      </tbody>
    </table>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'High'
  },
  render: () => <table style={{
    width: 320,
    tableLayout: 'fixed'
  }} data-testid='inline-badge-table'>
      <tbody>
        {(['left', 'center', 'right'] as const).map(align => <tr key={align}>
            <TableCell align={align}>
              <span data-testid={\`badge-\${align}\`} className='inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-medium ring-1 ring-emerald-500/25 ring-inset'>
                High
              </span>
            </TableCell>
            <TableCell>
              A long email@example.com label that must stay on one line
            </TableCell>
          </tr>)}
      </tbody>
    </table>
}`,...m.parameters?.docs?.source},description:{story:`Reproduces the padded inline badges used by the audience table.`,...m.parameters?.docs?.description}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <div style={{
    width: 320
  }} data-testid='creator-identity-table'>
      <UnifiedTable data={[creator]} columns={creatorColumns} minWidth='320px' enableVirtualization={false} />
    </div>
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  ...InlineBadges,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  ...CreatorIdentity,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...y.parameters?.docs?.source}}}})))()}x();export{_ as CreatorIdentity,y as CreatorIdentityLight,f as Default,m as InlineBadges,v as InlineBadgesLight,p as SecondaryTone,b as __namedExportsOrder,d as default};