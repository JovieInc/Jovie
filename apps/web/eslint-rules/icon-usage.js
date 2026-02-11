/**
 * ESLint rule to enforce icon usage standards in Jovie project
 *
 * Rules:
 * 1. Use Lucide React for general-purpose UI icons
 * 2. Use SimpleIcons via SocialIcon component for social/brand icons
 * 3. Only allow custom SVGs for approved use cases
 */

// Note: This rule doesn't currently use path utilities, but may in the future

// Import social platforms from the canonical source
const { SOCIAL_PLATFORMS } = require('../constants/platforms.cjs');

// Approved custom SVG files (relative to project root)
const APPROVED_CUSTOM_SVGS = [
  '/brand/jovie-logo.svg',
  '/brand/Jovie-Logo-Icon.svg',
  // Add more approved custom SVGs here
];

// Common UI icons that should use Lucide React
const COMMON_UI_ICONS = [
  'chevron',
  'arrow',
  'plus',
  'minus',
  'x',
  'check',
  'star',
  'heart',
  'home',
  'menu',
  'search',
  'settings',
  'user',
  'bell',
  'mail',
  'trash',
  'edit',
  'share',
  'download',
  'upload',
  'play',
  'pause',
  'stop',
  'forward',
  'backward',
  'volume',
  'mute',
  'calendar',
  'clock',
  'location',
  'phone',
  'camera',
  'image',
  'video',
  'document',
  'folder',
  'link',
  'external',
  'info',
  'warning',
  'error',
  'success',
  'question',
  'help',
  'close',
  'minimize',
  'maximize',
  'refresh',
  'sync',
  'filter',
  'sort',
  'grid',
  'list',
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce icon usage standards (Lucide React for UI, SimpleIcons for social/brand)',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      directSvgImport:
        'Direct SVG import detected. Use Lucide React for general UI icons or SocialIcon component for social/brand icons.',
      inlineSvg:
        'Inline SVG detected. Use Lucide React for UI icons or SocialIcon component for social/brand icons.',
      customSvgNotApproved:
        'Custom SVG usage requires approval. See docs/ICON_STANDARDS.md for the approval process.',
      useLucideReact:
        'Use Lucide React for general UI icons. Import from lucide-react.',
      useSocialIcon:
        'Use SocialIcon component for social media and brand icons: <SocialIcon platform="{{platform}}" />',
      directSimpleIcons:
        'Direct SimpleIcons usage detected. Use SocialIcon component instead: <SocialIcon platform="{{platform}}" />',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const filename = context.filename || context.getFilename();

    // Helper function to check if a string contains social platform keywords
    function containsSocialPlatform(str) {
      const lowerStr = str.toLowerCase();
      return SOCIAL_PLATFORMS.some(platform => lowerStr.includes(platform));
    }

    // Helper function to check if a string contains UI icon keywords
    function containsUIIcon(str) {
      const lowerStr = str.toLowerCase();
      return COMMON_UI_ICONS.some(icon => lowerStr.includes(icon));
    }

    // Helper function to check if SVG file is approved
    function isApprovedCustomSvg(importPath) {
      return APPROVED_CUSTOM_SVGS.some(approved =>
        importPath.includes(approved)
      );
    }

    return {
      // Check import declarations
      ImportDeclaration(node) {
        const importPath = node.source.value;

        // Check for direct SVG imports
        if (importPath.endsWith('.svg')) {
          if (!isApprovedCustomSvg(importPath)) {
            context.report({
              node,
              messageId: 'directSvgImport',
            });
          }
          return;
        }

        // Check for direct SimpleIcons imports
        if (importPath === 'simple-icons') {
          // Allow in SocialIcon component itself
          if (filename.includes('SocialIcon.tsx')) {
            return;
          }

          context.report({
            node,
            messageId: 'directSimpleIcons',
            data: {
              platform: 'appropriate-platform',
            },
          });
          return;
        }

        // Check for specific SimpleIcons imports
        if (importPath.startsWith('simple-icons/')) {
          const platform = importPath
            .replace('simple-icons/', '')
            .replace('si', '')
            .toLowerCase();
          context.report({
            node,
            messageId: 'useSocialIcon',
            data: { platform },
          });
        }
      },

      // Check JSX elements for inline SVGs

      // Check for img elements with SVG sources
      JSXElement(node) {
        if (node.openingElement.name.name === 'img') {
          const srcAttr = node.openingElement.attributes.find(
            attr => attr.name && attr.name.name === 'src'
          );

          if (srcAttr && srcAttr.value && srcAttr.value.type === 'Literal') {
            const srcValue = srcAttr.value.value;
            if (typeof srcValue === 'string' && srcValue.endsWith('.svg')) {
              if (!isApprovedCustomSvg(srcValue)) {
                context.report({
                  node,
                  messageId: 'customSvgNotApproved',
                });
              }
            }
          }
        }
      },

      // Check variable declarations for SVG content
      VariableDeclarator(node) {
        if (node.init && node.init.type === 'TemplateLiteral') {
          const templateValue = sourceCode.getText(node.init);
          if (
            templateValue.includes('<svg') &&
            templateValue.includes('</svg>')
          ) {
            // Allow SVG in server-side templates (footer.ts, etc.)
            const allowedServerFiles = ['footer.ts', 'email-template.ts'];
            if (allowedServerFiles.some(file => filename.includes(file))) {
              return;
            }
            if (containsSocialPlatform(templateValue)) {
              context.report({
                node,
                messageId: 'useSocialIcon',
                data: { platform: 'detected-platform' },
              });
            } else if (containsUIIcon(templateValue)) {
              context.report({
                node,
                messageId: 'useLucideReact',
              });
            } else {
              context.report({
                node,
                messageId: 'inlineSvg',
              });
            }
          }
        }
      },
    };
  },
};
