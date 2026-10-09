import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,c as r,i,n as a,o,r as s,s as c}from"./LoadingSkeleton-h3aKqw74.js";var l,u,d,f,p,m,h,g,_,v,y,b,x,S,C;function w(){return(w=e((()=>{l=t(),r(),u={title:`UI/LoadingSkeleton`,component:i,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{lines:{control:{type:`number`}},height:{control:{type:`text`}},width:{control:{type:`text`}},rounded:{control:{type:`select`},options:[`sm`,`md`,`lg`,`full`]}}},d={args:{}},f={args:{lines:3}},p={args:{height:`h-8`,width:`w-64`,rounded:`md`}},m={args:{height:`h-12`,width:`w-12`,rounded:`full`}},h={render:()=>(0,l.jsx)(n,{})},g={render:()=>(0,l.jsx)(a,{})},_={render:()=>(0,l.jsxs)(`div`,{className:`w-100 space-y-4`,children:[(0,l.jsx)(`div`,{"data-testid":`button-skeleton-geometry`,children:(0,l.jsx)(a,{})}),(0,l.jsx)(`button`,{className:`block h-12 w-full max-w-sm rounded-lg bg-surface-1`,"data-testid":`loaded-button-geometry`,type:`button`,children:`Loaded action`})]})},v={render:()=>(0,l.jsx)(o,{})},y={render:()=>(0,l.jsx)(s,{})},b={render:()=>(0,l.jsx)(c,{rows:3,columns:4})},x={render:()=>(0,l.jsxs)(`div`,{className:`space-y-6`,children:[(0,l.jsxs)(`div`,{className:`text-center`,children:[(0,l.jsx)(i,{height:`h-8`,width:`w-64`,rounded:`md`,label:`Loading reduced-motion preview`}),(0,l.jsx)(`p`,{className:`mt-2 text-sm text-secondary-token`,children:`With prefers-reduced-motion, the canonical base fill remains visible and shimmer animation is suppressed.`})]}),(0,l.jsxs)(`div`,{className:`rounded-lg bg-surface-0 p-4`,children:[(0,l.jsx)(`p`,{className:`mb-2 text-sm font-medium text-primary-token`,children:`How it works:`}),(0,l.jsxs)(`ul`,{className:`list-disc space-y-1 pl-5 text-sm text-secondary-token`,children:[(0,l.jsx)(`li`,{children:`Animated shimmer effect for most users`}),(0,l.jsx)(`li`,{children:`Canonical base fill when prefers-reduced-motion is enabled (no animation)`}),(0,l.jsx)(`li`,{children:`Uses motion-reduce animation and background-image fallbacks`}),(0,l.jsx)(`li`,{children:`Skeleton remains visible as a static placeholder while loading`}),(0,l.jsx)(`li`,{children:`Respects user accessibility preferences`})]})]})]})},S={render:()=>(0,l.jsxs)(`div`,{className:`space-y-8 max-w-md`,children:[(0,l.jsxs)(`div`,{children:[(0,l.jsx)(`h3`,{className:`text-lg font-medium mb-2`,children:`Profile Loading`}),(0,l.jsx)(n,{})]}),(0,l.jsxs)(`div`,{children:[(0,l.jsx)(`h3`,{className:`text-lg font-medium mb-2`,children:`Card Loading`}),(0,l.jsx)(s,{})]}),(0,l.jsxs)(`div`,{children:[(0,l.jsx)(`h3`,{className:`text-lg font-medium mb-2`,children:`Form Loading`}),(0,l.jsxs)(`div`,{className:`space-y-4`,children:[(0,l.jsx)(i,{height:`h-10`,rounded:`md`}),(0,l.jsx)(i,{height:`h-10`,rounded:`md`}),(0,l.jsx)(i,{height:`h-24`,rounded:`md`}),(0,l.jsx)(a,{})]})]})]})},C=[`Default`,`MultiLine`,`CustomSize`,`CircleSkeleton`,`Profile`,`Button`,`ButtonGeometryComparison`,`SocialBar`,`Card`,`Table`,`ReducedMotion`,`LoadingStates`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {}
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    lines: 3
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    height: 'h-8',
    width: 'w-64',
    rounded: 'md'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    height: 'h-12',
    width: 'w-12',
    rounded: 'full'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <ProfileSkeleton />
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <ButtonSkeleton />
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-100 space-y-4'>
      <div data-testid='button-skeleton-geometry'>
        <ButtonSkeleton />
      </div>
      <button className='block h-12 w-full max-w-sm rounded-lg bg-surface-1' data-testid='loaded-button-geometry' type='button'>
        Loaded action
      </button>
    </div>
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  render: () => <SocialBarSkeleton />
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  render: () => <CardSkeleton />
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: () => <TableSkeleton rows={3} columns={4} />
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-6'>
      <div className='text-center'>
        <LoadingSkeleton height='h-8' width='w-64' rounded='md' label='Loading reduced-motion preview' />
        <p className='mt-2 text-sm text-secondary-token'>
          With prefers-reduced-motion, the canonical base fill remains visible
          and shimmer animation is suppressed.
        </p>
      </div>
      <div className='rounded-lg bg-surface-0 p-4'>
        <p className='mb-2 text-sm font-medium text-primary-token'>
          How it works:
        </p>
        <ul className='list-disc space-y-1 pl-5 text-sm text-secondary-token'>
          <li>Animated shimmer effect for most users</li>
          <li>
            Canonical base fill when prefers-reduced-motion is enabled (no
            animation)
          </li>
          <li>Uses motion-reduce animation and background-image fallbacks</li>
          <li>
            Skeleton remains visible as a static placeholder while loading
          </li>
          <li>Respects user accessibility preferences</li>
        </ul>
      </div>
    </div>
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-8 max-w-md'>
      <div>
        <h3 className='text-lg font-medium mb-2'>Profile Loading</h3>
        <ProfileSkeleton />
      </div>

      <div>
        <h3 className='text-lg font-medium mb-2'>Card Loading</h3>
        <CardSkeleton />
      </div>

      <div>
        <h3 className='text-lg font-medium mb-2'>Form Loading</h3>
        <div className='space-y-4'>
          <LoadingSkeleton height='h-10' rounded='md' />
          <LoadingSkeleton height='h-10' rounded='md' />
          <LoadingSkeleton height='h-24' rounded='md' />
          <ButtonSkeleton />
        </div>
      </div>
    </div>
}`,...S.parameters?.docs?.source}}}})))()}w();export{g as Button,_ as ButtonGeometryComparison,y as Card,m as CircleSkeleton,p as CustomSize,d as Default,S as LoadingStates,f as MultiLine,h as Profile,x as ReducedMotion,v as SocialBar,b as Table,C as __namedExportsOrder,u as default};