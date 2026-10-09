import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ProfileForm-BOh1PRwc.js";var i,a,o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{i=t(),n(),a={id:`mock-id-123`,owner_user_id:`user-123`,handle:`artisthandle`,spotify_id:`spotify-123`,name:`Artist Name`,image_url:`https://via.placeholder.com/150`,tagline:`This is a sample artist tagline that showcases their music style and personality.`,settings:{},spotify_url:`https://spotify.com/artist/123`,apple_music_url:`https://music.apple.com/artist/123`,youtube_url:`https://youtube.com/channel/123`,published:!0,is_verified:!0,is_featured:!1,marketing_opt_out:!1,created_at:`2023-01-01T00:00:00Z`},o=e=>{},s=e=>(0,i.jsx)(r,{...e}),c={title:`Dashboard/Organisms/LegacyProfileForm`,component:s,parameters:{layout:`centered`,backgrounds:{default:`light`,values:[{name:`light`,value:`#ffffff`},{name:`dark`,value:`#1f2937`}]},a11y:{config:{rules:[{id:`color-contrast`,enabled:!0}]}}},tags:[`autodocs`],argTypes:{artist:{control:`object`},onUpdate:{action:`updated`}}},l={args:{artist:a,onUpdate:o}},u={args:{artist:{...a,name:``,tagline:``,image_url:``},onUpdate:o}},d={args:{artist:a,onUpdate:o},play:async({canvasElement:e})=>{let t=e.querySelector(`form`),n=e.querySelector(`input[placeholder="Your Artist Name"]`);n instanceof HTMLInputElement&&(n.value=``,n.dispatchEvent(new Event(`change`,{bubbles:!0}))),t&&t.dispatchEvent(new Event(`submit`,{bubbles:!0,cancelable:!0}))}},f={args:{artist:a,onUpdate:o},play:async({canvasElement:e})=>{let t=e.querySelector(`form`);t&&(t.dispatchEvent(new Event(`submit`,{bubbles:!0,cancelable:!0})),setTimeout(()=>{let e=document.createElement(`div`);e.className=`bg-green-500/10 border border-green-500/20 rounded-lg p-3`;let n=document.createElement(`p`);n.className=`text-sm text-green-600 dark:text-green-400`,n.textContent=`Profile updated successfully!`,e.appendChild(n),t.appendChild(e)},100))}},p={args:{artist:{...a,name:`This is a very long artist name that should test how the form handles overflow and wrapping of text in the name field`,tagline:`This is an extremely long tagline that should test how the form handles overflow and wrapping of text in the tagline field. It contains multiple sentences to ensure we have enough content to test the layout and styling of the form with long text inputs.`},onUpdate:o}},m={args:{artist:a,onUpdate:o},parameters:{backgrounds:{default:`dark`},themes:{themeOverride:`dark`}}},h=[`Default`,`EmptyFields`,`ValidationError`,`SuccessState`,`LongTextFields`,`DarkMode`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    artist: {
      ...mockArtist,
      name: '',
      tagline: '',
      image_url: ''
    },
    onUpdate: mockOnUpdate
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate
  },
  play: async ({
    canvasElement
  }) => {
    // Simulate form submission with validation error
    const form = canvasElement.querySelector('form');
    const nameInput = canvasElement.querySelector('input[placeholder="Your Artist Name"]');
    if (nameInput instanceof HTMLInputElement) {
      nameInput.value = '';
      nameInput.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    }
    if (form) {
      form.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true
      }));
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate
  },
  play: async ({
    canvasElement
  }) => {
    // Simulate successful form submission
    const form = canvasElement.querySelector('form');
    if (form) {
      form.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true
      }));

      // Mock the success state
      setTimeout(() => {
        const successElement = document.createElement('div');
        successElement.className = 'bg-green-500/10 border border-green-500/20 rounded-lg p-3';
        const successText = document.createElement('p');
        successText.className = 'text-sm text-green-600 dark:text-green-400';
        successText.textContent = 'Profile updated successfully!';
        successElement.appendChild(successText);
        form.appendChild(successElement);
      }, 100);
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    artist: {
      ...mockArtist,
      name: 'This is a very long artist name that should test how the form handles overflow and wrapping of text in the name field',
      tagline: 'This is an extremely long tagline that should test how the form handles overflow and wrapping of text in the tagline field. It contains multiple sentences to ensure we have enough content to test the layout and styling of the form with long text inputs.'
    },
    onUpdate: mockOnUpdate
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    themes: {
      themeOverride: 'dark'
    }
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{m as DarkMode,l as Default,u as EmptyFields,p as LongTextFields,f as SuccessState,d as ValidationError,h as __namedExportsOrder,c as default};