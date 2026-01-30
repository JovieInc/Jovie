import { Button } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '@/components/atoms/Badge';
import { DotBadge } from '@/components/atoms/DotBadge';
import { Icon } from '@/components/atoms/Icon';
import { Input } from '@/components/atoms/Input';
import { Label } from '@/components/atoms/Label';
import { NavLink } from '@/components/atoms/NavLink';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => '/test'),
}));

// Mock ResizeObserver for TruncatedText
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('Atoms Integration Tests', () => {
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = ResizeObserverMock as any;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  describe('Form Field Integration', () => {
    it('renders Input with Label correctly', () => {
      render(
        <div>
          <Label htmlFor='email'>Email Address</Label>
          <Input id='email' type='email' placeholder='you@example.com' />
        </div>
      );

      const label = screen.getByText('Email Address');
      const input = screen.getByPlaceholderText('you@example.com');

      expect(label).toBeInTheDocument();
      expect(input).toBeInTheDocument();
      expect(label).toHaveAttribute('for', 'email');
      expect(input).toHaveAttribute('id', 'email');
    });

    it('Label required indicator works with Input', () => {
      render(
        <div>
          <Label htmlFor='username' required>
            Username
          </Label>
          <Input id='username' required />
        </div>
      );

      const label = screen.getByText('Username');
      const input = screen.getByRole('textbox');

      expect(label.className).toContain("after:content-['*']");
      expect(input).toBeRequired();
    });

    it('Input with Label supports error state', () => {
      render(
        <div>
          <Label htmlFor='password'>Password</Label>
          <Input id='password' type='password' invalid />
          <span role='alert'>Password is required</span>
        </div>
      );

      const input = screen.getByLabelText('Password');
      const error = screen.getByRole('alert');

      expect(input).toBeInTheDocument();
      expect(error).toHaveTextContent('Password is required');
    });

    it('multiple form fields work together', () => {
      render(
        <form>
          <div>
            <Label htmlFor='first-name'>First Name</Label>
            <Input id='first-name' />
          </div>
          <div>
            <Label htmlFor='last-name'>Last Name</Label>
            <Input id='last-name' />
          </div>
          <Button type='submit'>Submit</Button>
        </form>
      );

      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Submit' })
      ).toBeInTheDocument();
    });
  });

  describe('Button Integration', () => {
    it('Button with Icon integration', () => {
      render(
        <Button>
          <Icon name='plus' size={16} />
          <span>Add Item</span>
        </Button>
      );

      const button = screen.getByRole('button', { name: /Add Item/i });
      expect(button).toBeInTheDocument();
    });

    it('Button state transitions', () => {
      const { rerender } = render(
        <Button>
          <span>Submit</span>
        </Button>
      );

      expect(screen.getByRole('button')).not.toBeDisabled();

      rerender(
        <Button disabled>
          <span>Submitting...</span>
        </Button>
      );

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Badge Combinations', () => {
    it('renders multiple badge types together', () => {
      render(
        <div>
          <Badge>Standard</Badge>
          <DotBadge
            label='Active'
            variant={{
              className: 'bg-green-100 text-green-700',
              dotClassName: 'bg-green-500',
            }}
          />
          <StatusBadge variant='green'>Success</StatusBadge>
          <VerifiedBadge />
        </div>
      );

      expect(screen.getByText('Standard')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(
        screen.getByLabelText('Verified Jovie Profile')
      ).toBeInTheDocument();
    });

    it('DotBadge with StatusBadge for status indicators', () => {
      render(
        <div>
          <DotBadge
            label='Online'
            variant={{
              className: 'bg-green-100 text-green-700',
              dotClassName: 'bg-green-500',
            }}
          />
          <StatusBadge variant='green' icon={<span>✓</span>}>
            Connected
          </StatusBadge>
        </div>
      );

      expect(screen.getByText('Online')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('Badge with VerifiedBadge for user profiles', () => {
      render(
        <div className='flex items-center gap-2'>
          <span>John Doe</span>
          <VerifiedBadge size='sm' />
          <Badge emphasis='subtle'>Pro</Badge>
        </div>
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(
        screen.getByLabelText('Verified Jovie Profile')
      ).toBeInTheDocument();
      expect(screen.getByText('Pro')).toBeInTheDocument();
    });
  });

  describe('Navigation Integration', () => {
    it('NavLink with Badge for notification indicators', () => {
      render(
        <NavLink href='/notifications' variant='primary'>
          Notifications
          <Badge className='ml-2'>3</Badge>
        </NavLink>
      );

      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('multiple NavLinks render correctly', () => {
      render(
        <nav>
          <NavLink href='/home' variant='primary'>
            Home
          </NavLink>
          <NavLink href='/profile' variant='primary'>
            Profile
          </NavLink>
          <NavLink href='/settings' variant='primary'>
            Settings
          </NavLink>
        </nav>
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(3);
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('NavLink with Icon integration', () => {
      render(
        <NavLink href='/dashboard' variant='primary'>
          <Icon name='home' size={16} />
          <span>Dashboard</span>
        </NavLink>
      );

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  describe('Text and Badge Integration', () => {
    it('TruncatedText with Badge', () => {
      render(
        <div className='flex items-center gap-2'>
          <TruncatedText lines={1}>
            This is a very long text that will be truncated
          </TruncatedText>
          <Badge>New</Badge>
        </div>
      );

      expect(
        screen.getByText('This is a very long text that will be truncated')
      ).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('TruncatedText with StatusBadge for status display', () => {
      render(
        <div>
          <TruncatedText lines={2}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit
          </TruncatedText>
          <StatusBadge variant='blue' size='sm'>
            Draft
          </StatusBadge>
        </div>
      );

      expect(screen.getByText(/Lorem ipsum/)).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });
  });

  describe('Complex Compositions', () => {
    it('renders complete form with all atoms', () => {
      render(
        <form>
          <div>
            <Label htmlFor='username' required>
              Username
            </Label>
            <Input id='username' placeholder='Enter username' />
          </div>
          <div>
            <Label htmlFor='email' required>
              Email
            </Label>
            <Input id='email' type='email' placeholder='you@example.com' />
          </div>
          <div className='flex gap-2'>
            <Button type='submit'>
              <Icon name='check' size={16} />
              Submit
            </Button>
            <Button type='button' variant='outline'>
              Cancel
            </Button>
          </div>
        </form>
      );

      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Submit/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cancel' })
      ).toBeInTheDocument();
    });

    it('renders user profile card with multiple atoms', () => {
      render(
        <div>
          <div className='flex items-center gap-2'>
            <h3>Jane Smith</h3>
            <VerifiedBadge size='md' />
            <Badge>Pro</Badge>
          </div>
          <TruncatedText lines={2}>
            Product designer and creative developer
          </TruncatedText>
          <div className='flex gap-2 mt-2'>
            <StatusBadge variant='green' size='sm'>
              Available
            </StatusBadge>
            <DotBadge
              label='Active'
              variant={{
                className: 'bg-green-100 text-green-700',
                dotClassName: 'bg-green-500',
              }}
              size='sm'
            />
          </div>
        </div>
      );

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(
        screen.getByLabelText('Verified Jovie Profile')
      ).toBeInTheDocument();
      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(
        screen.getByText('Product designer and creative developer')
      ).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders navigation menu with icons and badges', () => {
      render(
        <nav>
          <NavLink href='/' variant='primary'>
            <Icon name='home' size={16} />
            Home
          </NavLink>
          <NavLink href='/messages' variant='primary'>
            <Icon name='mail' size={16} />
            Messages
            <Badge className='ml-auto'>5</Badge>
          </NavLink>
          <NavLink href='/settings' variant='primary'>
            <Icon name='settings' size={16} />
            Settings
          </NavLink>
        </nav>
      );

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  describe('Interactive Compositions', () => {
    it('form submission with multiple inputs', () => {
      const handleSubmit = vi.fn(e => e.preventDefault());

      render(
        <form onSubmit={handleSubmit}>
          <Label htmlFor='name'>Name</Label>
          <Input id='name' />
          <Button type='submit'>Submit</Button>
        </form>
      );

      const input = screen.getByLabelText('Name');
      const button = screen.getByRole('button', { name: 'Submit' });

      fireEvent.change(input, { target: { value: 'John' } });
      fireEvent.click(button);

      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('button click updates badge state', () => {
      const { rerender } = render(
        <div>
          <Button>Increment</Button>
          <Badge>0</Badge>
        </div>
      );

      expect(screen.getByText('0')).toBeInTheDocument();

      rerender(
        <div>
          <Button>Increment</Button>
          <Badge>1</Badge>
        </div>
      );

      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('navigation link can be re-rendered with new content', () => {
      const { rerender } = render(
        <NavLink href='/page' variant='primary'>
          Page 1
        </NavLink>
      );

      expect(screen.getByText('Page 1')).toBeInTheDocument();

      rerender(
        <NavLink href='/page' variant='primary'>
          Page 2
        </NavLink>
      );

      expect(screen.getByText('Page 2')).toBeInTheDocument();
      expect(screen.queryByText('Page 1')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility in Compositions', () => {
    it('form fields have proper aria relationships', () => {
      render(
        <div>
          <Label htmlFor='search'>Search</Label>
          <Input
            id='search'
            type='search'
            aria-label='Search input'
            placeholder='Type to search...'
          />
        </div>
      );

      const input = screen.getByRole('searchbox');
      expect(input).toHaveAttribute('id', 'search');
      expect(input).toHaveAttribute('aria-label', 'Search input');
    });

    it('navigation maintains keyboard accessibility', () => {
      render(
        <nav>
          <NavLink href='/link1' variant='primary'>
            Link 1
          </NavLink>
          <NavLink href='/link2' variant='primary'>
            Link 2
          </NavLink>
        </nav>
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      links.forEach(link => {
        expect(link).toHaveAttribute('href');
      });
    });

    it('badges do not interfere with screen readers', () => {
      render(
        <button type='button'>
          Notifications
          <Badge className='ml-2' aria-label='3 new notifications'>
            3
          </Badge>
        </button>
      );

      const badge = screen.getByLabelText('3 new notifications');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Styling Compositions', () => {
    it('atoms maintain spacing in flex layouts', () => {
      const { container } = render(
        <div className='flex gap-2'>
          <Badge>Tag 1</Badge>
          <Badge>Tag 2</Badge>
          <Badge>Tag 3</Badge>
        </div>
      );

      const wrapper = container.querySelector('.flex.gap-2');
      expect(wrapper).toBeInTheDocument();
      expect(screen.getByText('Tag 1')).toBeInTheDocument();
      expect(screen.getByText('Tag 2')).toBeInTheDocument();
      expect(screen.getByText('Tag 3')).toBeInTheDocument();
    });

    it('atoms support custom className overrides in compositions', () => {
      render(
        <div>
          <Button className='w-full'>Full Width</Button>
          <Input className='border-red-500' />
          <Badge className='uppercase'>Custom</Badge>
        </div>
      );

      const button = screen.getByRole('button');
      const badge = screen.getByText('Custom');

      expect(button).toHaveClass('w-full');
      expect(badge).toHaveClass('uppercase');
    });
  });
});
