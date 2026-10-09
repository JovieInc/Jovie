import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./image-CenGJ5UI.js";import{n as a,t as o}from"./react-BHuztmV8.js";import{n as s,t as c}from"./EmptyState-yNZ1izLX.js";import{c as l,i as u}from"./LoadingSkeleton-h3aKqw74.js";function d({type:e,className:t=``,animate:n=!0}){let i=h[e],o=(0,p.jsx)(`div`,{className:`bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl shadow-black/5 text-center ${t}`,children:(0,p.jsx)(c,{icon:(0,p.jsx)(`div`,{className:`relative h-9 w-9 max-h-full max-w-full overflow-hidden`,children:(0,p.jsx)(r,{src:i.illustration,alt:i.altText,fill:!0,sizes:`36px`,className:`object-contain`,"aria-hidden":`true`})}),heading:i.heading,description:i.description,size:`default`,testId:`tipping-empty-state`,className:`px-0 py-0`})});return n?(0,p.jsx)(a.div,{variants:{hidden:{opacity:0,y:20},visible:{opacity:1,y:0,transition:{duration:.5,ease:[.16,1,.3,1],staggerChildren:.1}}},initial:`hidden`,animate:`visible`,className:`w-full`,children:(0,p.jsx)(a.div,{variants:{hidden:{opacity:0,y:10},visible:{opacity:1,y:0,transition:{duration:.4,ease:[.16,1,.3,1]}}},children:o})}):o}function f({className:e=``,rows:t=3}){let n=(0,m.useMemo)(()=>Array.from({length:t},(e,t)=>`tipping-row-${t}`),[t]);return(0,p.jsxs)(`div`,{className:`space-y-6 ${e}`,"aria-hidden":`true`,children:[(0,p.jsxs)(`div`,{className:`flex justify-between items-center`,children:[(0,p.jsx)(u,{height:`h-8`,width:`w-48`,rounded:`md`}),(0,p.jsx)(u,{height:`h-8`,width:`w-32`,rounded:`md`})]}),(0,p.jsxs)(`div`,{className:`grid grid-cols-1 md:grid-cols-2 gap-4`,children:[(0,p.jsxs)(`div`,{className:`bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-6 shadow-sm`,children:[(0,p.jsx)(u,{height:`h-6`,width:`w-32`,rounded:`md`,className:`mb-4`}),(0,p.jsx)(u,{height:`h-10`,width:`w-24`,rounded:`md`,className:`mb-2`}),(0,p.jsx)(u,{height:`h-4`,width:`w-full`,rounded:`sm`})]}),(0,p.jsxs)(`div`,{className:`bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-6 shadow-sm`,children:[(0,p.jsx)(u,{height:`h-6`,width:`w-32`,rounded:`md`,className:`mb-4`}),(0,p.jsx)(u,{height:`h-10`,width:`w-24`,rounded:`md`,className:`mb-2`}),(0,p.jsx)(u,{height:`h-4`,width:`w-full`,rounded:`sm`})]})]}),(0,p.jsxs)(`div`,{className:`bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-subtle rounded-2xl p-6 shadow-sm`,children:[(0,p.jsx)(u,{height:`h-6`,width:`w-48`,rounded:`md`,className:`mb-4`}),(0,p.jsxs)(`div`,{className:`space-y-4`,children:[(0,p.jsxs)(`div`,{className:`grid grid-cols-3 gap-4 pb-2 border-b border-subtle`,children:[(0,p.jsx)(u,{height:`h-5`,width:`w-full`,rounded:`sm`}),(0,p.jsx)(u,{height:`h-5`,width:`w-full`,rounded:`sm`}),(0,p.jsx)(u,{height:`h-5`,width:`w-full`,rounded:`sm`})]}),n.map(e=>(0,p.jsxs)(`div`,{className:`grid grid-cols-3 gap-4 py-2`,children:[(0,p.jsx)(u,{height:`h-5`,width:`w-full`,rounded:`sm`}),(0,p.jsx)(u,{height:`h-5`,width:`w-full`,rounded:`sm`}),(0,p.jsx)(u,{height:`h-5`,width:`w-full`,rounded:`sm`})]},e))]})]})]})}var p,m,h;function g(){return(g=e((()=>{p=n(),o(),i(),m=t(),s(),l(),h={"no-venmo":{heading:`No Venmo Account Connected`,description:`Connect your Venmo account to start receiving payments from your fans.`,illustration:`/images/tipping/empty-venmo.svg`,altText:`Illustration of a disconnected Venmo account`},"pending-metrics":{heading:`Payment Metrics Coming Soon`,description:`Your payment metrics will appear here once you receive your first payment.`,illustration:`/images/tipping/empty-metrics.svg`,altText:`Illustration of pending payment metrics`}}})))()}var _,v,y,b,x,S,C,w,T,E;function D(){return(D=e((()=>{_=n(),g(),v={title:`Tipping/EmptyStates`,component:d,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{type:{control:`select`,options:[`no-venmo`,`pending-metrics`],description:`Type of empty state to display`},animate:{control:`boolean`,description:`Whether to animate the empty state on mount`},className:{control:`text`,description:`Additional CSS classes to apply`}}},y={args:{type:`no-venmo`,animate:!0}},b={args:{type:`pending-metrics`,animate:!0}},x={args:{type:`no-venmo`,animate:!1}},S={args:{type:`pending-metrics`,animate:!0},parameters:{backgrounds:{default:`dark`},themes:{themeOverride:`dark`}}},C={render:()=>(0,_.jsx)(f,{})},w={render:()=>(0,_.jsx)(f,{rows:1})},T={render:()=>(0,_.jsx)(f,{}),parameters:{backgrounds:{default:`dark`},themes:{themeOverride:`dark`}}},E=[`NoVenmo`,`PendingMetrics`,`NoAnimation`,`DarkMode`,`MetricsSkeleton`,`MetricsSkeletonFewRows`,`MetricsSkeletonDark`],y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'no-venmo',
    animate: true
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'pending-metrics',
    animate: true
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'no-venmo',
    animate: false
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'pending-metrics',
    animate: true
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    themes: {
      themeOverride: 'dark'
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: () => <TippingMetricsSkeleton />
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: () => <TippingMetricsSkeleton rows={1} />
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  render: () => <TippingMetricsSkeleton />,
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    themes: {
      themeOverride: 'dark'
    }
  }
}`,...T.parameters?.docs?.source}}}})))()}D();export{S as DarkMode,C as MetricsSkeleton,T as MetricsSkeletonDark,w as MetricsSkeletonFewRows,x as NoAnimation,y as NoVenmo,b as PendingMetrics,E as __namedExportsOrder,v as default};