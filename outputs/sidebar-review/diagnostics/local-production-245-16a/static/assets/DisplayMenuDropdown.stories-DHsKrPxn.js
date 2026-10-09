import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./DisplayMenuDropdown-DBOqWNL3.js";var r,i,a,o,s,c,l,u;function d(){return(d=e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s={title:`Organisms/Table/DisplayMenuDropdown`,component:n,parameters:{layout:`padded`,jovie:{uncoveredProps:[`columnId`,`isVisible`,`onToggle`,`visible`]}}},c=[{id:`title`,label:`Title`},{id:`artist`,label:`Artist`},{id:`releaseDate`,label:`Release date`}],l={args:{viewMode:`list`,availableViewModes:[`list`,`board`],onViewModeChange:i(),density:`normal`,onDensityChange:i(),availableColumns:c,columnVisibility:{title:!0,artist:!0,releaseDate:!1},onColumnVisibilityChange:i(),groupingEnabled:!0,onGroupingToggle:i()},play:async({canvasElement:e})=>{await a.click(o(e).getByRole(`button`,{name:`Display`})),await r(await o(e.ownerDocument.body).findByRole(`switch`,{name:`Group rows`})).toBeChecked()}},u=[`GroupingToggle`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    viewMode: 'list',
    availableViewModes: ['list', 'board'],
    onViewModeChange: fn(),
    density: 'normal',
    onDensityChange: fn(),
    availableColumns: columns,
    columnVisibility: {
      title: true,
      artist: true,
      releaseDate: false
    },
    onColumnVisibilityChange: fn(),
    groupingEnabled: true,
    onGroupingToggle: fn()
  },
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole('button', {
      name: 'Display'
    }));
    await expect(await within(canvasElement.ownerDocument.body).findByRole('switch', {
      name: 'Group rows'
    })).toBeChecked();
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as GroupingToggle,u as __namedExportsOrder,s as default};