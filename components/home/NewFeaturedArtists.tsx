'use client';

import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import {
  type FeaturedCreator,
  FeaturedCreatorsSection,
} from '@/components/organisms/FeaturedArtistsSection';
import { Container } from '@/components/site/Container';

export function NewFeaturedArtists() {
  const [artists, setArtists] = useState<FeaturedCreator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hasCached = false;
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('featured-creators');
      if (cached) {
        try {
          setArtists(JSON.parse(cached));
          setIsLoading(false);
          hasCached = true;
        } catch {
          // Ignore JSON parse errors and fetch fresh data
        }
      }
    }

    const fetchArtists = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/featured-creators');
        if (!res.ok) throw new Error('Failed to fetch');
        const data: FeaturedCreator[] = await res.json();
        setArtists(data);
        if (typeof window !== 'undefined') {
          localStorage.setItem('featured-creators', JSON.stringify(data));
        }
        setError(null);
      } catch (err) {
        console.error('Error fetching artists:', err);
        if (!hasCached) {
          setError(
            "We're having trouble loading creators right now. Please refresh."
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchArtists();
  }, []);

  return (
    <section className='py-10 bg-white dark:bg-black'>
      <Container>
        <div className='text-center mb-6'>
          <p className='text-sm font-medium text-gray-600 dark:text-gray-400'>
            Explore example Jovie profiles
          </p>
        </div>

        {isLoading ? (
          <div className='flex items-center justify-center py-6'>
            <LoadingSpinner showDebounce />
          </div>
        ) : error ? (
          <div className='flex items-center justify-center py-6'>
            <p className='text-sm text-gray-600 dark:text-gray-400'>{error}</p>
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
