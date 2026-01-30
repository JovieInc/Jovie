# Artist Carousel Component

## Overview

The Artist Carousel is a full-width, interactive carousel component that showcases all seeded artists from the database. It provides an engaging way to discover and navigate to artist profiles directly from the homepage.

## Features

### 🎠 **Interactive Carousel**

- **Auto-play**: Automatically cycles through artists every 3 seconds
- **Manual Navigation**: Previous/Next buttons for manual control
- **Dot Indicators**: Click to jump to specific artists
- **Hover Pause**: Auto-play pauses when hovering over the carousel

### 🎨 **Visual Design**

- **Full-width Layout**: Spans the entire viewport width
- **Gradient Background**: Beautiful gradient from indigo to pink
- **Glass Morphism**: Semi-transparent backdrop with blur effects
- **Responsive Design**: Adapts to all screen sizes

### 🖼️ **Artist Display**

- **Profile Pictures**: Circular artist images with fallbacks
- **Artist Names**: Prominent display of artist names
- **Taglines**: Shows artist taglines/descriptions
- **Hover Effects**: Smooth scale and color transitions

### 🔗 **Navigation**

- **Direct Links**: Each artist card links to their profile page
- **Visual Feedback**: Hover states and transitions
- **Accessibility**: Proper ARIA labels and keyboard navigation

## Component Structure

### Files

- `components/home/ArtistCarousel.tsx` - Main carousel component (client-side)
- `components/home/FeaturedArtists.tsx` - Server component wrapper
- `components/home/HomeHero.tsx` - Hero section component
- `app/artists/page.tsx` - All artists page

### Props Interface

```typescript
interface Artist {
  id: string;
  handle: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
}

interface ArtistCarouselProps {
  artists: Artist[];
}
```

## Usage

### In Homepage

```tsx
import { FeaturedArtists } from '@/components/home/FeaturedArtists';

export default function HomePage() {
  return (
    <div>
      <HomeHero />
      <Suspense fallback={<div>Loading...</div>}>
        <FeaturedArtists />
      </Suspense>
    </div>
  );
}
```

### Standalone Usage

```tsx
import { ArtistCarousel } from '@/components/home/ArtistCarousel';

const artists = [
  {
    id: '1',
    handle: 'dualipa',
    name: 'Dua Lipa',
    image_url: 'https://...',
    tagline: 'Levitating - Future Nostalgia',
  },
  // ... more artists
];

<ArtistCarousel artists={artists} />;
```

## Technical Implementation

### State Management

- **currentIndex**: Tracks the currently displayed artist
- **isAutoPlaying**: Controls auto-play functionality
- **useEffect**: Manages auto-play interval

### Auto-play Logic

```typescript
useEffect(() => {
  if (!isAutoPlaying) return;

  const interval = setInterval(() => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % artists.length);
  }, 3000);

  return () => clearInterval(interval);
}, [isAutoPlaying, artists.length]);
```

### Navigation Functions

- **nextSlide()**: Move to next artist
- **prevSlide()**: Move to previous artist
- **goToSlide(index)**: Jump to specific artist
- **handleMouseEnter/Leave()**: Pause/resume auto-play

### Styling

- **Tailwind CSS**: Utility-first styling
- **CSS Transforms**: Smooth slide transitions
- **Backdrop Blur**: Modern glass morphism effects
- **Responsive Classes**: Mobile-first design

## Accessibility Features

### Keyboard Navigation

- **Tab Navigation**: All interactive elements are focusable
- **Enter/Space**: Activate buttons and links
- **Arrow Keys**: Navigate between artists (future enhancement)

### Screen Reader Support

- **ARIA Labels**: Descriptive labels for all buttons
- **Semantic HTML**: Proper heading structure
- **Alt Text**: Descriptive image alt text

### Visual Indicators

- **Focus Rings**: Clear focus indicators
- **Auto-play Status**: Visual indicator for auto-play state
- **Current Slide**: Active dot indicator

## Performance Optimizations

### Image Optimization

- **OptimizedImage Component**: Automatic image optimization
- **Lazy Loading**: Images load as needed
- **Fallback Images**: Placeholder images for missing photos

### React Optimizations

- **useCallback**: Memoized event handlers
- **useEffect Cleanup**: Proper interval cleanup
- **Conditional Rendering**: Only render when artists exist

### CSS Optimizations

- **Hardware Acceleration**: Transform-based animations
- **Efficient Transitions**: Optimized transition properties
- **Minimal Repaints**: Transform-only animations

## Customization Options

### Styling Customization

```typescript
// Custom background gradient
className="bg-linear-to-r from-blue-50 to-purple-50"

// Custom auto-play interval
const interval = setInterval(() => {
  setCurrentIndex((prevIndex) => (prevIndex + 1) % artists.length);
}, 5000); // 5 seconds instead of 3

// Custom image sizes
<OptimizedImage size="3xl" shape="square" />
```

### Behavior Customization

```typescript
// Disable auto-play
const [isAutoPlaying, setIsAutoPlaying] = useState(false);

// Custom navigation
const customNextSlide = () => {
  // Custom logic
  setCurrentIndex((prevIndex) => (prevIndex + 2) % artists.length);
};
```

## Future Enhancements

### Planned Features

- **Touch/Swipe Support**: Mobile gesture navigation
- **Keyboard Shortcuts**: Arrow key navigation
- **Infinite Scroll**: Seamless loop navigation
- **Thumbnail Preview**: Small preview images

### Performance Improvements

- **Virtual Scrolling**: For large artist lists
- **Image Preloading**: Preload next/previous images
- **Intersection Observer**: Lazy load when in viewport

### User Experience

- **Progress Bar**: Visual progress indicator
- **Play/Pause Button**: Manual auto-play control
- **Speed Control**: Adjustable auto-play speed
- **Fullscreen Mode**: Immersive viewing experience

## Integration with Database

### Data Fetching

```typescript
// Server component fetches data
const { data: artists, error } = await supabase
  .from('artists')
  .select('id, handle, name, image_url, tagline')
  .eq('published', true)
  .order('name');
```

### Error Handling

- **Graceful Degradation**: Component doesn't render if no artists
- **Loading States**: Suspense fallback for loading
- **Error Boundaries**: Proper error handling

### SEO Benefits

- **Server-side Rendering**: SEO-friendly content
- **Structured Data**: Artist information for search engines
- **Internal Linking**: Links to artist profiles improve SEO
