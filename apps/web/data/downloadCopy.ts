/**
 * Public /download copy. The Mac download is the desktop app. Do not call it
 * native: the Swift app is still only planned. The iPhone app is not a public
 * download on this page.
 */
export const DOWNLOAD_COPY = {
  metadata: {
    title: 'Download Jovie',
    description:
      'Download the Jovie Mac app. Developer ID signed and notarized by Apple.',
    socialDescription:
      'Download the Jovie Mac app. Developer ID signed and notarized by Apple.',
  },
  eyebrow: 'Mac app available now',
  headline: 'Jovie, Installed Where You Work.',
  hero: 'Download the Mac app. It opens the same Jovie account you use on the web.',
  heroDownload: 'Download for Mac',
  iphoneStatusLink: 'See iPhone status',
  proof: ['Developer ID signed', 'Apple notarized', 'Apple Silicon + Intel'],
  phoneAlt: 'Jovie profile on a phone',
  platforms: {
    mac: {
      label: 'Mac',
      title: 'Mac Workspace',
      body: 'Open Jovie from your Dock, keep your release workflow out of browser noise, and stay current with automatic updates.',
      action: 'Download for Mac',
      releasesAction: 'View releases',
    },
    iphone: {
      label: 'iPhone',
      title: 'iPhone App',
      body: 'The Mac app is the public download. The iPhone app is not available on this page.',
      status: 'Not a public download',
    },
  },
  workflowEyebrow: 'Release workflow',
  workflowTitle: 'Everything In Jovie, Closer.',
  features: [
    {
      title: 'One Workspace',
      body: 'Releases, links, audience data, and campaigns stay connected to the same Jovie account you use on the web.',
    },
    {
      title: 'Signed Releases',
      body: 'The Mac build is Developer ID signed, Apple notarized, and distributed from the latest GitHub release.',
    },
    {
      title: 'Daily Updates',
      body: 'The app updates in the background when you quit, so the next open is the latest version.',
    },
    {
      title: 'Apple Silicon and Intel',
      body: 'The same download runs on both Macs.',
    },
  ],
  installEyebrow: 'Install details',
  installTitle: 'Quiet After You Install.',
  installCards: [
    {
      title: 'Signed',
      body: 'Developer ID signed and notarized before release.',
    },
    {
      title: 'Updating',
      body: 'New builds install automatically after you quit.',
    },
    {
      title: 'Connected',
      body: 'Same account, profile, QR, and workspace data.',
    },
  ],
  requirementLabels: [
    'Operating System',
    'Architecture',
    'Memory',
    'Disk Space',
    'Network',
  ],
  requirementValues: {
    architecture: 'Apple Silicon or Intel Mac',
    memory: '4 GB RAM minimum, 8 GB recommended',
    disk: '500 MB free',
    network: 'Internet connection required',
  },
  faqHeading: 'Questions',
  faq: [
    {
      question: 'Is the Mac app safe?',
      answer:
        "Yes. Each release is signed with Jovie's Apple Developer ID and notarized by Apple before it is published. macOS verifies the app the first time you open it.",
    },
    {
      question: 'Does the app update itself?',
      answer:
        'Yes. Jovie checks for updates automatically and installs the latest version when you quit the app.',
    },
    {
      question: 'Does it work on Apple Silicon and Intel Macs?',
      answer:
        'Yes. Jovie for Mac is a universal app, so the same download works on both Apple Silicon and Intel Macs.',
    },
    {
      question: 'Do I need a Jovie account?',
      answer:
        'Yes. The Mac app connects to your existing Jovie workspace. You can sign in with the same account you use on jov.ie.',
    },
    {
      question: 'What about the iPhone app?',
      answer: 'It is not a public download. Use this page for the Mac app.',
    },
    {
      question: 'Where does the download come from?',
      answer:
        'The download button redirects to the latest signed Jovie release hosted on GitHub.',
    },
  ],
  footerTitle: 'Install the Mac app.',
  footerBody:
    'Download the Mac app today. It uses the same Jovie account as the web.',
  footerCta: 'Download for Mac',
  legal: {
    hosted: 'Releases are hosted on',
    hostLabel: 'GitHub',
    agree: 'By downloading the app you agree to the',
    terms: 'Terms of Service',
    and: 'and',
    privacy: 'Privacy Policy',
  },
} as const;
