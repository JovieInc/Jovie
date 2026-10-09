import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r,n as i,r as a,s as o,t as s}from"./shared-DAGdoALe.js";var c,l,u,d,f,p;function m(){return(m=e((()=>{c=t(),n(),l={title:`Profile/SubscriptionPearlComposer`,component:r,parameters:{layout:`centered`}},u={render:()=>(0,c.jsxs)(`div`,{className:`w-80 space-y-3`,children:[(0,c.jsx)(r,{action:(0,c.jsx)(`button`,{type:`button`,className:o,disabled:!0,children:`Save`}),children:(0,c.jsx)(`input`,{"aria-label":`First name`,placeholder:`First name`})}),(0,c.jsx)(a,{resendCooldownEnd:0,isResending:!1,onResend:()=>void 0})]})},d={render:()=>(0,c.jsx)(`div`,{className:`flex h-16 items-center`,children:(0,c.jsx)(s,{error:`Enter a valid email`})})},f={render:()=>(0,c.jsx)(`div`,{className:`w-80`,children:(0,c.jsx)(i,{})})},p=[`Composer`,`DesktopErrorIndicator`,`FormSkeleton`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-80 space-y-3'>
      <SubscriptionPearlComposer action={<button type='button' className={profilePrimaryPillClassName} disabled>
            Save
          </button>}>
        <input aria-label='First name' placeholder='First name' />
      </SubscriptionPearlComposer>
      <SubscriptionOtpResendAction resendCooldownEnd={0} isResending={false} onResend={() => undefined} />
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex h-16 items-center'>
        <SubscriptionDesktopErrorIndicator error='Enter a valid email' />
      </div>
}`,...d.parameters?.docs?.source},description:{story:"Desktop error tooltip — the `-error` token, not raw red-* (JOV-6773).",...d.parameters?.docs?.description}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-80'>
      <SubscriptionFormSkeleton />
    </div>
}`,...f.parameters?.docs?.source},description:{story:`Loading placeholder shown while checking subscription status.`,...f.parameters?.docs?.description}}}})))()}m();export{u as Composer,d as DesktopErrorIndicator,f as FormSkeleton,p as __namedExportsOrder,l as default};