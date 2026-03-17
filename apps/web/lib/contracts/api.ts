export interface SpotifyArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  followers?: number;
  popularity: number;
  verified?: boolean;
  isClaimed?: boolean;
}

export interface AppleMusicArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  genres?: string[];
}

export interface EnvHealthResponse {
  service: 'env';
  status: 'ok' | 'warning' | 'error';
  ok: boolean;
  timestamp: string;
  details: {
    environment: string;
    platform: string;
    nodeVersion: string;
    startupValidationCompleted: boolean;
    currentValidation: {
      valid: boolean;
      errors: string[];
      warnings: string[];
      critical: string[];
    };
    integrations: {
      database: boolean;
      auth: boolean;
      payments: boolean;
      images: boolean;
    };
  };
}

export interface AvatarUploadResponse {
  blobUrl: string;
  success?: boolean;
}
