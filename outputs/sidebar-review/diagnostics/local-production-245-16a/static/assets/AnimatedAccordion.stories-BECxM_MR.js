import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./AnimatedAccordion-Da3XmXtM.js";var a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{a=n(),o=t(),r(),s={title:`Organisms/AnimatedAccordion`,component:i,parameters:{layout:`centered`},argTypes:{delay:{control:{type:`range`,min:0,max:1,step:.1}},duration:{control:{type:`range`,min:.1,max:1,step:.1}}}},c={args:{isOpen:!0,children:(0,a.jsx)(`div`,{className:`p-4 bg-surface-1 border border-subtle rounded-lg`,children:(0,a.jsx)(`p`,{className:`text-secondary`,children:`This content is visible when the accordion is open. It animates smoothly in and out.`})})},decorators:[e=>(0,a.jsx)(`div`,{className:`w-80`,children:(0,a.jsx)(e,{})})]},l={args:{isOpen:!1,children:(0,a.jsx)(`div`,{className:`p-4 bg-surface-1 border border-subtle rounded-lg`,children:(0,a.jsx)(`p`,{className:`text-secondary`,children:`This content is hidden.`})})},decorators:[e=>(0,a.jsx)(`div`,{className:`w-80`,children:(0,a.jsx)(e,{})})]},u={render:function(){let[e,t]=(0,o.useState)(!1);return(0,a.jsxs)(`div`,{className:`w-80 space-y-4`,children:[(0,a.jsxs)(`button`,{type:`button`,onClick:()=>t(!e),className:`w-full px-4 py-2 bg-primary-token text-(--color-bg-base) dark:bg-base dark:text-primary-token rounded-md font-medium`,children:[e?`Close`:`Open`,` Accordion`]}),(0,a.jsx)(i,{isOpen:e,children:(0,a.jsxs)(`div`,{className:`p-4 bg-surface-1 border border-subtle rounded-lg`,children:[(0,a.jsx)(`h3`,{className:`font-semibold mb-2`,children:`Accordion Content`}),(0,a.jsx)(`p`,{className:`text-secondary text-sm`,children:`This content animates smoothly when toggled. The animation respects reduced motion preferences.`})]})})]})}},d={render:function(){let[e,t]=(0,o.useState)(null);return(0,a.jsx)(`div`,{className:`w-96 space-y-2`,children:[{q:`What is Jovie?`,a:`Jovie is a link-in-bio platform for artists and creators.`},{q:`Is it free?`,a:`Yes! Jovie offers a free tier with all essential features.`},{q:`Can I remove branding?`,a:`Yes, upgrade to Pro to remove branding and unlock advanced features.`}].map((n,r)=>(0,a.jsxs)(`div`,{className:`border border-subtle rounded-lg overflow-hidden`,children:[(0,a.jsxs)(`button`,{type:`button`,onClick:()=>t(e===r?null:r),className:`w-full px-4 py-3 text-left font-medium flex justify-between items-center`,children:[n.q,(0,a.jsx)(`span`,{children:e===r?`−`:`+`})]}),(0,a.jsx)(i,{isOpen:e===r,children:(0,a.jsx)(`div`,{className:`px-4 pb-3 text-secondary text-sm`,children:n.a})})]},n.q))})}},f=[`Open`,`Closed`,`Interactive`,`FAQExample`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    children: <div className='p-4 bg-surface-1 border border-subtle rounded-lg'>
        <p className='text-secondary'>
          This content is visible when the accordion is open. It animates
          smoothly in and out.
        </p>
      </div>
  },
  decorators: [Story => <div className='w-80'>
        <Story />
      </div>]
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: false,
    children: <div className='p-4 bg-surface-1 border border-subtle rounded-lg'>
        <p className='text-secondary'>This content is hidden.</p>
      </div>
  },
  decorators: [Story => <div className='w-80'>
        <Story />
      </div>]
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: function InteractiveAccordion() {
    const [isOpen, setIsOpen] = useState(false);
    return <div className='w-80 space-y-4'>
        <button type='button' onClick={() => setIsOpen(!isOpen)} className='w-full px-4 py-2 bg-primary-token text-(--color-bg-base) dark:bg-base dark:text-primary-token rounded-md font-medium'>
          {isOpen ? 'Close' : 'Open'} Accordion
        </button>
        <AnimatedAccordion isOpen={isOpen}>
          <div className='p-4 bg-surface-1 border border-subtle rounded-lg'>
            <h3 className='font-semibold mb-2'>Accordion Content</h3>
            <p className='text-secondary text-sm'>
              This content animates smoothly when toggled. The animation
              respects reduced motion preferences.
            </p>
          </div>
        </AnimatedAccordion>
      </div>;
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: function FAQAccordion() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const faqs = [{
      q: 'What is Jovie?',
      a: 'Jovie is a link-in-bio platform for artists and creators.'
    }, {
      q: 'Is it free?',
      a: 'Yes! Jovie offers a free tier with all essential features.'
    }, {
      q: 'Can I remove branding?',
      a: 'Yes, upgrade to Pro to remove branding and unlock advanced features.'
    }];
    return <div className='w-96 space-y-2'>
        {faqs.map((faq, index) => <div key={faq.q} className='border border-subtle rounded-lg overflow-hidden'>
            <button type='button' onClick={() => setOpenIndex(openIndex === index ? null : index)} className='w-full px-4 py-3 text-left font-medium flex justify-between items-center'>
              {faq.q}
              <span>{openIndex === index ? '−' : '+'}</span>
            </button>
            <AnimatedAccordion isOpen={openIndex === index}>
              <div className='px-4 pb-3 text-secondary text-sm'>{faq.a}</div>
            </AnimatedAccordion>
          </div>)}
      </div>;
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{l as Closed,d as FAQExample,u as Interactive,c as Open,f as __namedExportsOrder,s as default};