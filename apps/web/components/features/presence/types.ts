import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import type {
  ProfileQualificationStatus,
  ProfileSurfaceKind,
} from '@/lib/profile-surfaces/contracts';
import type { PresenceIdentityPhoto } from '@/lib/profile-surfaces/presence-identity';

export type ProfilesWorkspaceFilter =
  | 'all'
  | 'identity'
  | 'profiles'
  | 'catalog'
  | 'connector';

export interface ProfileWorkspaceSurfaceRow {
  readonly id: string;
  readonly rowType: 'surface';
  readonly kind: ProfileSurfaceKind;
  readonly platform: string;
  readonly label: string;
  readonly handle: string | null;
  readonly url: string;
  readonly trackedUrl: string | null;
  readonly qualificationStatus: ProfileQualificationStatus;
  readonly isOfficial: boolean;
  readonly monitoringState: 'active' | 'paused' | 'locked' | 'unavailable';
  readonly rank: number | null;
  readonly previousRank: number | null;
  readonly lastObservedAt: string | null;
  readonly identityEvidence?: {
    readonly sourceCount: number;
    readonly sourceTypes: readonly string[];
    readonly confidence: number | null;
  };
  readonly identityPhoto?: PresenceIdentityPhoto;
}

export interface ProfileWorkspaceConnectorRow {
  readonly id: string;
  readonly rowType: 'connector';
  readonly kind: 'connector';
  readonly platform: 'gmail' | 'google_calendar';
  readonly label: string;
  readonly handle: string | null;
  readonly url: string;
  readonly status: ConnectorStatus;
  readonly monitoringState: 'active' | 'paused' | 'unavailable';
}

export type ProfileWorkspaceRow =
  | ProfileWorkspaceSurfaceRow
  | ProfileWorkspaceConnectorRow;

export interface ProfilesWorkspaceData {
  readonly profileId: string;
  readonly artist: {
    readonly name: string;
    readonly username: string;
    readonly avatarUrl: string | null;
    readonly isPublic: boolean;
  };
  readonly rows: ProfileWorkspaceRow[];
  readonly monitoringLimit: number | null;
  readonly monitoredCount: number;
  readonly qualifiedShare: number | null;
  readonly bestJovieRank: number | null;
  readonly lastObservedAt: string | null;
  readonly providerAvailable: boolean;
}

export type ConnectionStatusTone = 'success' | 'warning' | 'error' | 'neutral';

export interface ConnectionStatus {
  readonly label: string;
  readonly tone: ConnectionStatusTone;
  readonly needsAttention: boolean;
  readonly nextAction: string;
  readonly sortPriority: number;
}

export type PresenceSignalKind =
  | 'state'
  | 'blocker'
  | 'finding'
  | 'recommendation';

export type PresenceSignalTone = 'success' | 'warning' | 'error' | 'neutral';

export interface PresenceSignal {
  readonly kind: PresenceSignalKind;
  readonly tone: PresenceSignalTone;
  readonly label: string;
  readonly detail: string;
  readonly sortOrder: number;
}

export type PresenceCheckOutcome = 'pass' | 'warn' | 'fail';
export type PresenceCheckEvidence =
  | {
      readonly state: 'unconfigured';
      readonly reason: string;
    }
  | {
      readonly state: 'measured';
      readonly outcome: PresenceCheckOutcome;
      /** Short measured value, e.g. `Indexed` or `92`. */
      readonly summary: string;
      readonly checkedAt: string;
    };
