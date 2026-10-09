import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./link-CDLGfkIv.js";var i,a,o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{i=t(),n(),a={title:`shadcn/Link`,component:r,parameters:{layout:`centered`,docs:{description:{component:`Canonical inline link primitive with default, subtle, and inline variants. States: default, hover, focus-visible, active (:active + data-state="active"), visited (:visited + data-state="visited"), and disabled (aria-disabled + state tokens). Composes onto Next.js Link via asChild (Radix Slot).`}}},tags:[`autodocs`],argTypes:{variant:{control:{type:`select`},options:[`default`,`subtle`,`inline`]},active:{control:{type:`boolean`}},disabled:{control:{type:`boolean`}},visited:{control:{type:`boolean`}},asChild:{control:{type:`boolean`}}}},o={args:{href:`#features`,children:`View release analytics`},parameters:{docs:{description:{story:`Default state also covers native :hover and :focus-visible interaction states.`}}}},s={args:{href:`#docs`,variant:`subtle`,children:`Read the docs`}},c={args:{href:`#terms`,variant:`inline`,children:`Terms of service`}},l={args:{href:`#active-example`,active:!0,children:`Current page link`},parameters:{docs:{description:{story:`Active/pressed link styling via data-state="active" and the interactive accent token --color-accent; native :active applies the same token while pressing.`}}}},u={args:{href:`#visited-example`,visited:!0,children:`Previously opened link`},parameters:{docs:{description:{story:`Documents visited link styling via data-state="visited" and :visited token --color-link-visited.`}}}},d={args:{href:`#disabled-example`,disabled:!0,children:`Unavailable link`},parameters:{docs:{description:{story:`Disabled links set aria-disabled, data-state="disabled", pointer-events-none, and the disabled-visual tokens (--state-disabled-opacity, --color-text-disabled-token). Anchors do not support the disabled attribute.`}}}},f={render:e=>(0,i.jsx)(r,{...e,asChild:!0,children:(0,i.jsx)(`button`,{type:`button`,children:`Composed child element`})}),parameters:{docs:{description:{story:`asChild composes the primitive onto a single child via Radix Slot. In apps, this is how the canonical Link keeps Next.js <Link> client-side navigation: <Link asChild><NextLink href="/x">…</NextLink></Link>.`}}}},p={render:()=>(0,i.jsxs)(`div`,{className:`grid justify-items-start gap-3`,children:[(0,i.jsx)(r,{href:`#default`,children:`Default destination`}),(0,i.jsx)(r,{href:`#subtle`,variant:`subtle`,children:`Subtle destination`}),(0,i.jsx)(r,{href:`#inline`,variant:`inline`,children:`Inline destination`}),(0,i.jsx)(r,{href:`#current`,active:!0,children:`Current destination`}),(0,i.jsx)(r,{href:`#disabled`,disabled:!0,children:`Unavailable destination`})]})},m=[`Default`,`Subtle`,`Inline`,`Active`,`Visited`,`Disabled`,`AsChild`,`StateMatrix`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    href: '#features',
    children: 'View release analytics'
  },
  parameters: {
    docs: {
      description: {
        story: 'Default state also covers native :hover and :focus-visible interaction states.'
      }
    }
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    href: '#docs',
    variant: 'subtle',
    children: 'Read the docs'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    href: '#terms',
    variant: 'inline',
    children: 'Terms of service'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    href: '#active-example',
    active: true,
    children: 'Current page link'
  },
  parameters: {
    docs: {
      description: {
        story: 'Active/pressed link styling via data-state="active" and the interactive accent token --color-accent; native :active applies the same token while pressing.'
      }
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    href: '#visited-example',
    visited: true,
    children: 'Previously opened link'
  },
  parameters: {
    docs: {
      description: {
        story: 'Documents visited link styling via data-state="visited" and :visited token --color-link-visited.'
      }
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    href: '#disabled-example',
    disabled: true,
    children: 'Unavailable link'
  },
  parameters: {
    docs: {
      description: {
        story: 'Disabled links set aria-disabled, data-state="disabled", pointer-events-none, and the disabled-visual tokens (--state-disabled-opacity, --color-text-disabled-token). Anchors do not support the disabled attribute.'
      }
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: args => <Link {...args} asChild>
      <button type='button'>Composed child element</button>
    </Link>,
  parameters: {
    docs: {
      description: {
        story: 'asChild composes the primitive onto a single child via Radix Slot. In apps, this is how the canonical Link keeps Next.js <Link> client-side navigation: <Link asChild><NextLink href="/x">…</NextLink></Link>.'
      }
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid justify-items-start gap-3'>
      <Link href='#default'>Default destination</Link>
      <Link href='#subtle' variant='subtle'>
        Subtle destination
      </Link>
      <Link href='#inline' variant='inline'>
        Inline destination
      </Link>
      <Link href='#current' active>
        Current destination
      </Link>
      <Link href='#disabled' disabled>
        Unavailable destination
      </Link>
    </div>
}`,...p.parameters?.docs?.source}}}})))()}h();export{l as Active,f as AsChild,o as Default,d as Disabled,c as Inline,p as StateMatrix,s as Subtle,u as Visited,m as __namedExportsOrder,a as default};