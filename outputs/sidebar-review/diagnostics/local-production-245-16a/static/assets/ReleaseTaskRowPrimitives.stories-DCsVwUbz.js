import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,n as r}from"./ReleaseTaskRowPrimitives-BtgMuHRn.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={id:`task-story`,releaseId:`release-story`,creatorProfileId:`profile-story`,templateItemId:`template-story`,title:`Pitch playlist editors`,description:null,explainerText:null,learnMoreUrl:null,videoUrl:null,category:`Marketing`,status:`todo`,priority:`medium`,position:1,assigneeType:`human`,assigneeUserId:null,aiWorkflowId:null,dueDaysOffset:3,dueDate:new Date(`2026-09-01T00:00:00.000Z`),completedAt:null,metadata:null,createdAt:new Date(`2026-08-01T00:00:00.000Z`),updatedAt:new Date(`2026-08-01T00:00:00.000Z`)},s={title:`Features/Dashboard/Release Tasks/ReleaseTaskRowPrimitives`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsxs)(`div`,{className:`flex items-center gap-3 rounded-md border border-subtle bg-surface-1 p-4`,children:[(0,i.jsx)(e,{}),(0,i.jsx)(`span`,{className:`text-app text-secondary-token`,children:o.title})]})],args:{task:o,isDone:!1,onToggle:a()}},c={},l={args:{isDone:!0,task:{...o,status:`done`,completedAt:new Date(`2026-09-02T00:00:00.000Z`)}}},u={args:{task:{...o,assigneeType:`ai_workflow`}}},d=[`Todo`,`Done`,`Automated`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    isDone: true,
    task: {
      ...task,
      status: 'done',
      completedAt: new Date('2026-09-02T00:00:00.000Z')
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...task,
      assigneeType: 'ai_workflow'
    }
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{u as Automated,l as Done,c as Todo,d as __namedExportsOrder,s as default};