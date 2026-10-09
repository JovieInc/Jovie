import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./label-CaJvPCxj.js";import{n as i,t as a}from"./switch-UoHGDReW.js";var o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{o=t(),n(),i(),{expect:s,userEvent:c,waitFor:l}=__STORYBOOK_MODULE_TEST__,u={title:`UI/Atoms/Switch`,component:a,parameters:{layout:`centered`},tags:[`autodocs`]},d={render:()=>(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-default`}),(0,o.jsx)(r,{htmlFor:`sw-default`,children:`Notifications`})]})},f={render:()=>(0,o.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-on`,defaultChecked:!0}),(0,o.jsx)(r,{htmlFor:`sw-on`,children:`Notifications enabled`})]})},p={render:()=>(0,o.jsxs)(`div`,{className:`grid gap-4`,children:[(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-off-dis`,disabled:!0}),(0,o.jsx)(r,{htmlFor:`sw-off-dis`,children:`Disabled`})]}),(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-on-dis`,disabled:!0,defaultChecked:!0}),(0,o.jsx)(r,{htmlFor:`sw-on-dis`,children:`Disabled and enabled`})]})]})},m={render:()=>(0,o.jsxs)(`div`,{className:`grid gap-4`,children:[(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-matrix-off`}),(0,o.jsx)(r,{htmlFor:`sw-matrix-off`,children:`Off`})]}),(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-matrix-on`,defaultChecked:!0}),(0,o.jsx)(r,{htmlFor:`sw-matrix-on`,children:`On`})]})]})},h={render:()=>(0,o.jsxs)(`div`,{className:`grid gap-4`,"data-testid":`switch-conformance`,children:[(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-conformance-keyboard`,"aria-label":`Keyboard toggle`}),(0,o.jsx)(r,{htmlFor:`sw-conformance-keyboard`,children:`Keyboard toggle`})]}),(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-conformance-checked`,"aria-label":`Checked toggle`,defaultChecked:!0}),(0,o.jsx)(r,{htmlFor:`sw-conformance-checked`,children:`Checked`})]}),(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-conformance-disabled`,"aria-label":`Disabled toggle`,disabled:!0}),(0,o.jsx)(r,{htmlFor:`sw-conformance-disabled`,children:`Disabled`})]}),(0,o.jsxs)(`div`,{className:`flex min-h-11 items-center gap-2`,children:[(0,o.jsx)(a,{id:`sw-conformance-invalid`,"aria-label":`Invalid toggle`,"aria-invalid":`true`}),(0,o.jsx)(r,{htmlFor:`sw-conformance-invalid`,children:`Invalid`})]})]}),play:async({canvasElement:e})=>{let t=e.querySelector(`[role="switch"][aria-label="Keyboard toggle"]`);if(await l(()=>s(t).toBeInTheDocument()),!t)return;await c.tab(),await s(t).toHaveFocus(),await s(t).toHaveAttribute(`aria-checked`,`false`),await c.keyboard(` `),await s(t).toHaveAttribute(`aria-checked`,`true`),await s(t).toHaveFocus();let n=e.querySelector(`[role="switch"][aria-invalid="true"]`);await s(n).toBeInTheDocument(),await s(n).toHaveAttribute(`aria-invalid`,`true`);let r=e.querySelector(`[role="switch"][disabled]`);await s(r).toBeDisabled();let i=t.getBoundingClientRect(),a=getComputedStyle(t,`::before`);await s([i.width,i.height]).toEqual([28,16]),await s([a.width,a.height]).toEqual([`44px`,`44px`])},parameters:{docs:{description:{story:`Canonical Switch proof: unchecked, checked, disabled, invalid, focus, Space activation, and the 28×16 visual control with a 44px hit target.`}}}},g=[`Default`,`Checked`,`Disabled`,`StateMatrix`,`ConformanceMatrix`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      <Switch id='sw-default' />
      <Label htmlFor='sw-default'>Notifications</Label>
    </div>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      <Switch id='sw-on' defaultChecked />
      <Label htmlFor='sw-on'>Notifications enabled</Label>
    </div>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-4'>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-off-dis' disabled />
        <Label htmlFor='sw-off-dis'>Disabled</Label>
      </div>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-on-dis' disabled defaultChecked />
        <Label htmlFor='sw-on-dis'>Disabled and enabled</Label>
      </div>
    </div>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-4'>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-matrix-off' />
        <Label htmlFor='sw-matrix-off'>Off</Label>
      </div>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-matrix-on' defaultChecked />
        <Label htmlFor='sw-matrix-on'>On</Label>
      </div>
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-4' data-testid='switch-conformance'>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-conformance-keyboard' aria-label='Keyboard toggle' />
        <Label htmlFor='sw-conformance-keyboard'>Keyboard toggle</Label>
      </div>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-conformance-checked' aria-label='Checked toggle' defaultChecked />
        <Label htmlFor='sw-conformance-checked'>Checked</Label>
      </div>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-conformance-disabled' aria-label='Disabled toggle' disabled />
        <Label htmlFor='sw-conformance-disabled'>Disabled</Label>
      </div>
      <div className='flex min-h-11 items-center gap-2'>
        <Switch id='sw-conformance-invalid' aria-label='Invalid toggle' aria-invalid='true' />
        <Label htmlFor='sw-conformance-invalid'>Invalid</Label>
      </div>
    </div>,
  play: async ({
    canvasElement
  }) => {
    const keyboardSwitch = canvasElement.querySelector<HTMLElement>('[role="switch"][aria-label="Keyboard toggle"]');
    await waitFor(() => expect(keyboardSwitch).toBeInTheDocument());
    if (!keyboardSwitch) return;
    await userEvent.tab();
    await expect(keyboardSwitch).toHaveFocus();
    await expect(keyboardSwitch).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard(' ');
    await expect(keyboardSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(keyboardSwitch).toHaveFocus();
    const invalidSwitch = canvasElement.querySelector<HTMLElement>('[role="switch"][aria-invalid="true"]');
    await expect(invalidSwitch).toBeInTheDocument();
    await expect(invalidSwitch).toHaveAttribute('aria-invalid', 'true');
    const disabledSwitch = canvasElement.querySelector<HTMLElement>('[role="switch"][disabled]');
    await expect(disabledSwitch).toBeDisabled();
    const visibleBox = keyboardSwitch.getBoundingClientRect();
    const hitTarget = getComputedStyle(keyboardSwitch, '::before');
    await expect([visibleBox.width, visibleBox.height]).toEqual([28, 16]);
    await expect([hitTarget.width, hitTarget.height]).toEqual(['44px', '44px']);
  },
  parameters: {
    docs: {
      description: {
        story: 'Canonical Switch proof: unchecked, checked, disabled, invalid, focus, Space activation, and the 28×16 visual control with a 44px hit target.'
      }
    }
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{f as Checked,h as ConformanceMatrix,d as Default,p as Disabled,m as StateMatrix,g as __namedExportsOrder,u as default};