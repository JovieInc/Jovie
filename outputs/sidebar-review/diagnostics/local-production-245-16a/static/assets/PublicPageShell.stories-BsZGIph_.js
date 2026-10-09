import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./PublicPageShell-BkQfPJxe.js";import{i,n as a}from"./marketingStoryMeta-B12ISWnH.js";var o,s,c,l,u;function d(){return(d=e((()=>{o=t(),a(),n(),s={title:`Site/PublicPageShell`,component:r,parameters:{...i,docs:{description:{component:`Adjacent component coverage for the canonical shell.public-page story. Header, main offset, skip link, and footer remain composed from their canonical owners.`}}},tags:[`autodocs`]},c={args:{children:null},render:()=>(0,o.jsx)(r,{footerVariant:`minimal`,mainOffset:!1,children:(0,o.jsx)(`section`,{className:`bg-base px-6 py-16 text-primary-token`,children:(0,o.jsxs)(`div`,{className:`mx-auto max-w-public-content`,children:[(0,o.jsx)(`h1`,{className:`text-3xl font-semibold`,children:`Public page content`}),(0,o.jsx)(`p`,{className:`mt-4 max-w-prose-canonical text-secondary-token`,children:`The shell keeps navigation, skip access, main content, and footer composition in one public route frame.`})]})})})},l={args:{children:null},render:()=>(0,o.jsx)(r,{footerVariant:`minimal`,headerVariant:`minimal`,mainOffset:!1,skipToContent:!1,children:(0,o.jsx)(`section`,{className:`bg-base px-6 py-16 text-primary-token`,children:(0,o.jsxs)(`div`,{className:`mx-auto max-w-public-content`,children:[(0,o.jsx)(`h1`,{className:`text-3xl font-semibold`,children:`Minimal public frame`}),(0,o.jsx)(`p`,{className:`mt-4 max-w-prose-canonical text-secondary-token`,children:`Compact routes can opt out of the fixed-header offset and skip link when their surrounding layout owns those affordances.`})]})})})},u=[`Default`,`MinimalHeaderWithoutSkipLink`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <PublicPageShell footerVariant='minimal' mainOffset={false}>
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Public page content</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            The shell keeps navigation, skip access, main content, and footer
            composition in one public route frame.
          </p>
        </div>
      </section>
    </PublicPageShell>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <PublicPageShell footerVariant='minimal' headerVariant='minimal' mainOffset={false} skipToContent={false}>
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Minimal public frame</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            Compact routes can opt out of the fixed-header offset and skip link
            when their surrounding layout owns those affordances.
          </p>
        </div>
      </section>
    </PublicPageShell>
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Default,l as MinimalHeaderWithoutSkipLink,u as __namedExportsOrder,s as default};