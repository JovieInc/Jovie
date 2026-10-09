import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./ChatMessage-BnAJmlSs.js";var r,i,a,o,s,c,l,u;function d(){return(d=e((()=>{t(),r=[{type:`text`,text:`Your profile update is ready to review.`}],i=[{type:`text`,text:`Update my bio`}],a={title:`Jovie/Components/ChatMessage`,component:n,parameters:{layout:`centered`},args:{id:`story-assistant-message`,role:`assistant`,parts:r,skipEntrance:!0}},o={},s={args:{id:`story-user-message`,role:`user`,parts:i}},c={args:{id:`story-streaming-placeholder`,role:`assistant`,parts:[],isThinking:!0,renderTools:!1}},l={args:{id:`story-inline-message`,role:`assistant`,parts:r,showAssistantActions:!1,toolVariant:`inline`}},u=[`AssistantReply`,`UserBubble`,`StreamingPlaceholder`,`InlineEmbed`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    id: 'story-user-message',
    role: 'user',
    parts: userParts
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    id: 'story-streaming-placeholder',
    role: 'assistant',
    parts: [],
    isThinking: true,
    renderTools: false
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    id: 'story-inline-message',
    role: 'assistant',
    parts: assistantParts,
    showAssistantActions: false,
    toolVariant: 'inline'
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{o as AssistantReply,l as InlineEmbed,c as StreamingPlaceholder,s as UserBubble,u as __namedExportsOrder,a as default};