declare module 'heic2any' {
  export interface Heic2AnyOptions {
    blob: Blob;
    toType?: 'image/png' | 'image/jpeg' | 'image/gif';
    quality?: number;
    gifInterval?: number;
    multiple?: boolean;
  }

  function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
  export default heic2any;
}
