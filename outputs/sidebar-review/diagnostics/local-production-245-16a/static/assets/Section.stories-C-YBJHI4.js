import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";import{n as i,t as a}from"./Container-BAXViFRB.js";function o({children:e,className:t,containerSize:n=`lg`,containerClassName:i,padding:o=`lg`,withGridBg:l=!1,withBorder:u=!1,as:d=`section`,...f}){return(0,s.jsxs)(d,{className:r(`relative`,c[o],u&&`border-t border-subtle`,t),...f,children:[l&&(0,s.jsx)(`div`,{className:`absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]`}),(0,s.jsx)(a,{size:n,className:r(`relative`,i),children:e})]})}var s,c;function l(){return(l=e((()=>{s=t(),i(),n(),c={none:``,sm:`py-12 sm:py-16`,md:`py-16 sm:py-20`,lg:`py-20 sm:py-24`,xl:`py-24 sm:py-32`}})))()}var u,d,f,p,m,h,g,_,v,y;function b(){return(b=e((()=>{u=t(),l(),d={title:`Molecules/Section`,component:o,parameters:{layout:`fullscreen`},argTypes:{containerSize:{control:`select`,options:[`sm`,`md`,`lg`,`xl`,`full`]},padding:{control:`select`,options:[`none`,`sm`,`md`,`lg`,`xl`]},withGridBg:{control:`boolean`},withBorder:{control:`boolean`}}},f=()=>(0,u.jsxs)(`div`,{className:`text-center`,children:[(0,u.jsx)(`h2`,{className:`text-3xl font-bold mb-4`,children:`Section Title`}),(0,u.jsx)(`p`,{className:`text-secondary max-w-2xl mx-auto`,children:`This is a section component that provides consistent padding, container sizing, and optional background patterns for page layouts.`})]}),p={args:{padding:`lg`,containerSize:`lg`,children:(0,u.jsx)(f,{})}},m={args:{padding:`lg`,containerSize:`lg`,withGridBg:!0,children:(0,u.jsx)(f,{})}},h={args:{padding:`lg`,containerSize:`lg`,withBorder:!0,children:(0,u.jsx)(f,{})}},g={args:{padding:`sm`,containerSize:`md`,children:(0,u.jsx)(f,{})}},_={args:{padding:`xl`,containerSize:`xl`,children:(0,u.jsx)(f,{})}},v={render:()=>(0,u.jsxs)(`div`,{children:[(0,u.jsx)(o,{padding:`lg`,containerSize:`lg`,children:(0,u.jsxs)(`div`,{className:`text-center`,children:[(0,u.jsx)(`h2`,{className:`text-3xl font-bold mb-4`,children:`First Section`}),(0,u.jsx)(`p`,{className:`text-secondary`,children:`Content for the first section.`})]})}),(0,u.jsx)(o,{padding:`lg`,containerSize:`lg`,withBorder:!0,withGridBg:!0,children:(0,u.jsxs)(`div`,{className:`text-center`,children:[(0,u.jsx)(`h2`,{className:`text-3xl font-bold mb-4`,children:`Second Section`}),(0,u.jsx)(`p`,{className:`text-secondary`,children:`Content with grid background and border.`})]})}),(0,u.jsx)(o,{padding:`lg`,containerSize:`lg`,withBorder:!0,children:(0,u.jsxs)(`div`,{className:`text-center`,children:[(0,u.jsx)(`h2`,{className:`text-3xl font-bold mb-4`,children:`Third Section`}),(0,u.jsx)(`p`,{className:`text-secondary`,children:`Content for the third section.`})]})})]})},y=[`Default`,`WithGridBackground`,`WithBorder`,`SmallPadding`,`ExtraLargePadding`,`StackedSections`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    padding: 'lg',
    containerSize: 'lg',
    children: <SampleContent />
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    padding: 'lg',
    containerSize: 'lg',
    withGridBg: true,
    children: <SampleContent />
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    padding: 'lg',
    containerSize: 'lg',
    withBorder: true,
    children: <SampleContent />
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    padding: 'sm',
    containerSize: 'md',
    children: <SampleContent />
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    padding: 'xl',
    containerSize: 'xl',
    children: <SampleContent />
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  render: () => <div>
      <Section padding='lg' containerSize='lg'>
        <div className='text-center'>
          <h2 className='text-3xl font-bold mb-4'>First Section</h2>
          <p className='text-secondary'>Content for the first section.</p>
        </div>
      </Section>
      <Section padding='lg' containerSize='lg' withBorder withGridBg>
        <div className='text-center'>
          <h2 className='text-3xl font-bold mb-4'>Second Section</h2>
          <p className='text-secondary'>
            Content with grid background and border.
          </p>
        </div>
      </Section>
      <Section padding='lg' containerSize='lg' withBorder>
        <div className='text-center'>
          <h2 className='text-3xl font-bold mb-4'>Third Section</h2>
          <p className='text-secondary'>Content for the third section.</p>
        </div>
      </Section>
    </div>
}`,...v.parameters?.docs?.source}}}})))()}b();export{p as Default,_ as ExtraLargePadding,g as SmallPadding,v as StackedSections,h as WithBorder,m as WithGridBackground,y as __namedExportsOrder,d as default};