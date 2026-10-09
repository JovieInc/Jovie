import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./contact-actions-DSHxusxd.js";function i({items:e}){return(0,a.jsx)(`ul`,{className:`w-56 rounded-lg border border-subtle bg-surface-1 p-1 text-app`,children:e.map((e,t)=>`type`in e?(0,a.jsx)(`li`,{className:`my-1 h-px bg-subtle`},`separator-${t}`):(0,a.jsx)(`li`,{className:`destructive`in e&&e.destructive?`text-destructive`:`text-secondary-token`,children:e.label},e.id))})}var a,o,s,c,l,u;function d(){return(d=e((()=>{a=t(),n(),o={id:`contact-1`,creatorProfileId:`profile-1`,role:`management`,customLabel:null,personName:`Jamie Rivera`,companyName:null,territories:[],email:`jamie@example.com`,phone:`+1 555-0100`,preferredChannel:`email`,isActive:!0,sortOrder:0},s={title:`Dashboard/Organisms/ContactsTable/contact-actions`,parameters:{layout:`padded`}},c={render:()=>(0,a.jsx)(i,{items:r(o,{onDelete:()=>{}})})},l={render:()=>(0,a.jsx)(i,{items:r({...o,email:null,phone:null},{onDelete:()=>{}})})},u=[`WithEmailAndPhone`,`NoContactMethods`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <MenuItemsPreview items={buildContactActions(contact, {
    onDelete: () => {}
  })} />
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <MenuItemsPreview items={buildContactActions({
    ...contact,
    email: null,
    phone: null
  }, {
    onDelete: () => {}
  })} />
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as NoContactMethods,c as WithEmailAndPhone,u as __namedExportsOrder,s as default};