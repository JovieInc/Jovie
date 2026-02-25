const config = {
  project: {
    link: 'https://github.com/JovieInc/Jovie',
  },
  docsRepositoryBase: 'https://github.com/JovieInc/Jovie/tree/main/apps/docs',
  footer: {
    text: 'Jovie documentation',
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s · Jovie Docs',
    };
  },
};

export default config;
