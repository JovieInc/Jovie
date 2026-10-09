import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ClaimBanner-vpncrQNt.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={title:`Profile/ClaimBanner`,component:r,parameters:{layout:`fullscreen`}},o={args:{profileHandle:`johndoe`}},s={args:{profileHandle:`johndoe`,displayName:`John Doe`}},c={args:{profileHandle:`theofficialartistname`,displayName:`The Official Artist Name`}},l={render:()=>(0,i.jsxs)(`div`,{className:`min-h-screen bg-base text-primary-token`,children:[(0,i.jsx)(r,{profileHandle:`artistname`,displayName:`Artist Name`}),(0,i.jsx)(`div`,{className:`p-8 text-center`,children:(0,i.jsx)(`p`,{className:`text-secondary`,children:`Profile content would appear here...`})})]})},u=[`Default`,`WithDisplayName`,`LongName`,`InProfileContext`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    profileHandle: 'johndoe'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    profileHandle: 'johndoe',
    displayName: 'John Doe'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    profileHandle: 'theofficialartistname',
    displayName: 'The Official Artist Name'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='min-h-screen bg-base text-primary-token'>
      <ClaimBanner profileHandle='artistname' displayName='Artist Name' />
      <div className='p-8 text-center'>
        <p className='text-secondary'>Profile content would appear here...</p>
      </div>
    </div>
}`,...l.parameters?.docs?.source}}}})))()}d();export{o as Default,l as InProfileContext,c as LongName,s as WithDisplayName,u as __namedExportsOrder,a as default};