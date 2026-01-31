import type { Artist } from '@/types/db';

export interface ProfileFormProps {
  readonly artist: Artist;
  readonly onUpdate: (artist: Artist) => void;
}

export interface ProfileFormData {
  name: string;
  tagline: string;
  image_url: string;
  hide_branding: boolean;
}

export interface UseProfileFormReturn {
  formRef: React.RefObject<HTMLFormElement | null>;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  error: string | undefined;
  success: boolean;
  formSubmitted: boolean;
  validationErrors: Record<string, string>;
  hasRemoveBrandingFeature: boolean;
  formData: ProfileFormData;
  formErrors: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}
