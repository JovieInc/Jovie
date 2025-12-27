function plopGenerator(plop) {
  // Helper for PascalCase
  plop.setHelper(
    'pascalCase',
    text =>
      text.charAt(0).toUpperCase() +
      text.slice(1).replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
  );

  // Helper for kebab-case
  plop.setHelper('kebabCase', text =>
    text.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  );

  // Atom generator
  plop.setGenerator('atom', {
    description: 'Create a new atomic component (shared, reusable primitive)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Component name (PascalCase):',
        validate: value => {
          if (!value) return 'Component name is required';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Component name must be PascalCase (e.g., Button, LoadingSpinner)';
          }
          return true;
        },
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'components/atoms/{{name}}.tsx',
        templateFile: 'plop-templates/atom.hbs',
      },
      {
        type: 'add',
        path: 'components/atoms/{{name}}.stories.tsx',
        templateFile: 'plop-templates/atom.stories.hbs',
      },
      {
        type: 'add',
        path: 'components/atoms/{{name}}.test.tsx',
        templateFile: 'plop-templates/atom.test.hbs',
      },
      {
        type: 'modify',
        path: 'components/atoms/index.ts',
        pattern: /(export \* from.*\n?)$/,
        template: "$1export * from './{{name}}';\n",
      },
    ],
  });

  // Molecule generator
  plop.setGenerator('molecule', {
    description:
      'Create a new molecule component (simple combination of atoms)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Component name (PascalCase):',
        validate: value => {
          if (!value) return 'Component name is required';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Component name must be PascalCase (e.g., SearchField, AuthActions)';
          }
          return true;
        },
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'components/molecules/{{name}}.tsx',
        templateFile: 'plop-templates/molecule.hbs',
      },
      {
        type: 'add',
        path: 'components/molecules/{{name}}.stories.tsx',
        templateFile: 'plop-templates/molecule.stories.hbs',
      },
      {
        type: 'add',
        path: 'components/molecules/{{name}}.test.tsx',
        templateFile: 'plop-templates/molecule.test.hbs',
      },
    ],
  });

  // Organism generator
  plop.setGenerator('organism', {
    description:
      'Create a new organism component (complex, self-contained system)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Component name (PascalCase):',
        validate: value => {
          if (!value) return 'Component name is required';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Component name must be PascalCase (e.g., HeaderNav, ProductFlyout)';
          }
          return true;
        },
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'components/organisms/{{name}}.tsx',
        templateFile: 'plop-templates/organism.hbs',
      },
      {
        type: 'add',
        path: 'components/organisms/{{name}}.stories.tsx',
        templateFile: 'plop-templates/organism.stories.hbs',
      },
      {
        type: 'add',
        path: 'components/organisms/{{name}}.test.tsx',
        templateFile: 'plop-templates/organism.test.hbs',
      },
    ],
  });

  // Feature component generator
  plop.setGenerator('feature', {
    description: 'Create a new feature component (domain-specific)',
    prompts: [
      {
        type: 'list',
        name: 'feature',
        message: 'Which feature does this belong to?',
        choices: [
          'auth',
          'dashboard',
          'home',
          'pricing',
          'profile',
          'tipping',
          'other',
        ],
      },
      {
        type: 'input',
        name: 'customFeature',
        message: 'Enter feature name (kebab-case):',
        when: answers => answers.feature === 'other',
        validate: value => {
          if (!value) return 'Feature name is required';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Feature name must be kebab-case (e.g., user-settings, link-in-bio)';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'name',
        message: 'Component name (PascalCase):',
        validate: value => {
          if (!value) return 'Component name is required';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Component name must be PascalCase (e.g., ClaimHandleForm, FeaturedArtists)';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'atomicLevel',
        message: 'What atomic level is this component?',
        choices: ['atoms', 'molecules', 'organisms'],
      },
    ],
    actions: data => {
      const featureName = data.customFeature || data.feature;
      return [
        {
          type: 'add',
          path: 'components/{{feature}}/{{atomicLevel}}/{{name}}.tsx',
          templateFile: 'plop-templates/feature.hbs',
          data: { featureName },
        },
        {
          type: 'add',
          path: 'components/{{feature}}/{{atomicLevel}}/{{name}}.stories.tsx',
          templateFile: 'plop-templates/feature.stories.hbs',
          data: { featureName },
        },
        {
          type: 'add',
          path: 'components/{{feature}}/{{atomicLevel}}/{{name}}.test.tsx',
          templateFile: 'plop-templates/feature.test.hbs',
          data: { featureName },
        },
      ];
    },
  });

  // Hook generator
  plop.setGenerator('hook', {
    description: 'Create a new custom React hook',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Hook name (without "use" prefix):',
        validate: value => {
          if (!value) return 'Hook name is required';
          if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Hook name must be camelCase (e.g., Profile, LocalStorage)';
          }
          return true;
        },
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'lib/hooks/use{{pascalCase name}}.ts',
        templateFile: 'plop-templates/hook.hbs',
      },
      {
        type: 'add',
        path: 'lib/hooks/use{{pascalCase name}}.test.ts',
        templateFile: 'plop-templates/hook.test.hbs',
      },
    ],
  });
}

export default plopGenerator;
