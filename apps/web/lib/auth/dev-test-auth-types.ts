export type DevTestAuthPersona = 'creator' | 'creator-ready' | 'admin';

export interface DevTestAuthActor {
  readonly persona: DevTestAuthPersona;
  readonly clerkUserId: string;
  readonly email: string;
  readonly username: string;
  readonly fullName: string;
  readonly isAdmin: boolean;
  readonly profilePath: string | null;
}

export interface ClientAuthBootstrap {
  readonly isAuthenticated: boolean;
  readonly userId: string;
  readonly email: string;
  readonly username: string | null;
  readonly fullName: string;
  readonly isAdmin: boolean;
  readonly persona: DevTestAuthPersona;
}
