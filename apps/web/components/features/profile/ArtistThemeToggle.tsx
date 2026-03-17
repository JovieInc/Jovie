'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Moon, Sun } from 'lucide-react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useArtistTheme } from './ArtistThemeProvider';

export function ArtistThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useArtistTheme();

  const handleToggle = () => {
    if (theme === 'auto') {
      // If currently auto, switch to the opposite of current resolved theme
      setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    } else {
      // If currently set to a specific theme, switch to the opposite
      setTheme(theme === 'light' ? 'dark' : 'light');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CircleIconButton
          size='xs'
          variant='secondary'
          onClick={handleToggle}
          ariaLabel={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
        >
          {resolvedTheme === 'light' ? (
            <Moon className='h-4 w-4 text-secondary-token' aria-hidden='true' />
          ) : (
            <Sun className='h-4 w-4 text-secondary-token' aria-hidden='true' />
          )}
        </CircleIconButton>
      </TooltipTrigger>
      <TooltipContent side='right'>
        {`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
      </TooltipContent>
    </Tooltip>
  );
}
