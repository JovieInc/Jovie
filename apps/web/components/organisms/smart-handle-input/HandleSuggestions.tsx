'use client';

interface HandleSuggestionsProps {
  readonly suggestions: string[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

export function HandleSuggestions({
  suggestions,
  disabled,
  onChange,
}: HandleSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className='space-y-2'>
      <p className='text-xs text-secondary-token'>Try these instead:</p>
      <div className='flex flex-wrap gap-2'>
        {suggestions.slice(0, 3).map(suggestion => (
          <button
            key={suggestion}
            type='button'
            onClick={() => onChange(suggestion)}
            className='text-xs px-3 py-1.5 rounded-md transition-colors duration-150 font-sans bg-surface-2 hover:bg-surface-3 text-primary-token'
            disabled={disabled}
          >
            @{suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
