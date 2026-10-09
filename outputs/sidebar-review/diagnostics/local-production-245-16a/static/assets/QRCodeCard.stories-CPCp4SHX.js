import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./QRCode-YtD5-hzy.js";function i({data:e,title:t=`Scan QR Code`,description:n,qrSize:i=120,className:o=``}){return(0,a.jsxs)(`div`,{className:`space-y-3 text-center ${o}`,children:[(0,a.jsx)(r,{data:e,size:i,label:t,className:`mx-auto`}),t&&(0,a.jsx)(`h3`,{className:`text-sm font-medium text-primary-token`,children:t}),n&&(0,a.jsx)(`p`,{className:`text-xs leading-5 text-secondary-token`,children:n})]})}var a;function o(){return(o=e((()=>{a=t(),n()})))()}var s,c,l,u,d,f,p,m,h,g,_,v,y;function b(){return(b=e((()=>{s=t(),o(),c={title:`Molecules/QRCodeCard`,component:i,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{qrSize:{control:{type:`number`,min:100,max:300,step:10}}}},l={args:{data:`https://jov.ie/taylorswift`}},u={args:{data:`https://jov.ie/edsheeran`,title:`View Profile`,description:`Scan with your phone to view this artist profile`}},d={args:{data:`https://jov.ie/billieeilish?mode=pay`,title:`Pay Artist`,description:`Scan to pay via Apple Pay`,qrSize:150}},f={args:{data:`https://jov.ie/theweeknd?utm_source=qr&utm_medium=mobile`,title:`View on Mobile`,description:`Best experience on your phone`,qrSize:120}},p={args:{data:`https://jov.ie/drake`,title:`Artist Profile`,description:`Scan to view music, links, and more`,qrSize:200}},m={args:{data:`https://jov.ie/arianagrande`,title:`Scan QR Code`}},h={args:{data:`https://jov.ie/postmalone`,description:`Scan with your camera app`}},g={args:{data:`https://jov.ie/dualipa`,qrSize:100}},_={render:()=>(0,s.jsx)(`div`,{className:`p-6 bg-white/60 dark:bg-white/5 backdrop-blur-md rounded-xl border border-gray-200/30 dark:border-white/10`,children:(0,s.jsx)(i,{data:`https://jov.ie/taylorswift`,title:`View Artist Profile`,description:`Scan to view on mobile for the best experience`,qrSize:160})})},v={render:()=>(0,s.jsx)(`div`,{className:`fixed bottom-4 right-4 z-50 flex flex-col items-center rounded-xl p-4 ring-1 ring-black/10 dark:ring-white/10 shadow-xl bg-white/85 dark:bg-gray-900/80 backdrop-blur-md`,children:(0,s.jsx)(i,{data:`https://jov.ie/oliviarodrigo`,title:`View on Mobile`,qrSize:120})}),parameters:{layout:`fullscreen`}},y=[`Default`,`WithCustomTitle`,`PayCard`,`MobileProfile`,`LargeCard`,`NoDescription`,`NoTitle`,`MinimalCard`,`InContainer`,`DesktopOverlay`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/taylorswift'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/edsheeran',
    title: 'View Profile',
    description: 'Scan with your phone to view this artist profile'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/billieeilish?mode=pay',
    title: 'Pay Artist',
    description: 'Scan to pay via Apple Pay',
    qrSize: 150
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/theweeknd?utm_source=qr&utm_medium=mobile',
    title: 'View on Mobile',
    description: 'Best experience on your phone',
    qrSize: 120
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/drake',
    title: 'Artist Profile',
    description: 'Scan to view music, links, and more',
    qrSize: 200
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/arianagrande',
    title: 'Scan QR Code'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/postmalone',
    description: 'Scan with your camera app'
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    data: 'https://jov.ie/dualipa',
    qrSize: 100
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <div className='p-6 bg-white/60 dark:bg-white/5 backdrop-blur-md rounded-xl border border-gray-200/30 dark:border-white/10'>
      <QRCodeCard data='https://jov.ie/taylorswift' title='View Artist Profile' description='Scan to view on mobile for the best experience' qrSize={160} />
    </div>
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  render: () => <div className='fixed bottom-4 right-4 z-50 flex flex-col items-center rounded-xl p-4 ring-1 ring-black/10 dark:ring-white/10 shadow-xl bg-white/85 dark:bg-gray-900/80 backdrop-blur-md'>
      <QRCodeCard data='https://jov.ie/oliviarodrigo' title='View on Mobile' qrSize={120} />
    </div>,
  parameters: {
    layout: 'fullscreen'
  }
}`,...v.parameters?.docs?.source}}}})))()}b();export{l as Default,v as DesktopOverlay,_ as InContainer,p as LargeCard,g as MinimalCard,f as MobileProfile,m as NoDescription,h as NoTitle,d as PayCard,u as WithCustomTitle,y as __namedExportsOrder,c as default};