'use client';

import { useState, useEffect } from 'react';
import { Container } from '@/components/site/Container';
import { FeaturedCreatorsSection } from '@/components/organisms/FeaturedArtistsSection';
import type { FeaturedCreator } from '@/components/organisms/FeaturedArtistsSection';

// Mock data for artist profiles
const mockArtists: FeaturedCreator[] = [
  {
    id: '1',
    handle: 'artist1',
    name: 'Artist One',
    src: '/android-chrome-192x192.png',
  },
  {
    id: '2',
    handle: 'artist2',
    name: 'Artist Two',
    src: '/android-chrome-192x192.png',
  },
  {
    id: '3',
    handle: 'artist3',
    name: 'Artist Three',
    src: '/android-chrome-192x192.png',
  },
  {
    id: '4',
    handle: 'artist4',
    name: 'Artist Four',
    src: '/android-chrome-192x192.png',
  },
  {
    id: '5',
    handle: 'artist5',
    name: 'Artist Five',
    src: '/android-chrome-192x192.png',
  },
  {
    id: '6',
    handle: 'artist6',
    name: 'Artist Six',
    src: '/android-chrome-192x192.png',
  },
];

export function NewFeaturedArtists() {
  const [isLoading, setIsLoading] = useState(true);
  const [artists, setArtists] = useState<FeaturedCreator[]>([]);

  // Simulate loading artists from API
  useEffect(() => {
    const fetchArtists = async () => {
      try {
        // In a real implementation, this would be an API call
        // For now, we'll use mock data with a simulated delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Set the artists
        setArtists(mockArtists);
      } catch (error) {
        console.error('Error fetching artists:', error);
        // Fallback to mock data
        setArtists(mockArtists);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArtists();
  }, []);

  return (
    <section className="py-10 bg-white dark:bg-black">
      <Container>
        <div className="text-center mb-6">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Explore example Jovie profiles
          </p>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-pulse text-gray-600 dark:text-white/60">
              Loading example profiles...
            </div>
          </div>
        ) : (
          <FeaturedCreatorsSection 
            creators={artists} 
            showTitle={false}
            showNames={true}
          />
        )}
      </Container>
    </section>
  );
}

