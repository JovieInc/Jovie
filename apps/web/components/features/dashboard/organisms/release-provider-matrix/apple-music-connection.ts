import { toast } from 'sonner';
import { connectAppleMusicArtist } from '@/app/app/(shell)/dashboard/releases/actions';

export interface AppleMusicArtistSelection {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string;
}

export async function connectSelectedAppleMusicArtist(
  artist: AppleMusicArtistSelection,
  onConnected: () => void
): Promise<void> {
  try {
    const result = await connectAppleMusicArtist({
      externalArtistId: artist.id,
      externalArtistName: artist.name,
      externalArtistUrl: artist.url,
      externalArtistImageUrl: artist.imageUrl,
    });
    if (result.success) {
      onConnected();
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : 'Failed to connect Apple Music'
    );
  }
}
