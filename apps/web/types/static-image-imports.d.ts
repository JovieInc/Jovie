/**
 * Ambient modules for static image imports.
 * next-env.d.ts is gitignored; CI typecheck still needs *.png module types
 * when components import catalog/public assets directly.
 */
declare module '*.png' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.jpg' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.jpeg' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.webp' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.gif' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.avif' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.ico' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.bmp' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

declare module '*.svg' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}
