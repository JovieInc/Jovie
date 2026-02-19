# Component Architecture Guide

## Philosophy: Speed + Simplicity + Scale

Following Y Combinator principles: optimize for fast iteration, minimal cognitive overhead, and effortless scaling.

## Atomic Design + YC Speed Principles

### Component Hierarchy

```
components/
├── atoms/           # Primitives (Button, Input, QRCode)
├── molecules/       # Combinations (AuthActions, SearchField)
├── organisms/       # Systems (HeaderNav, ProductFlyout)
└── [feature]/       # Feature-specific components
    ├── atoms/
    ├── molecules/
    └── organisms/
```

### Naming Standards

#### Files & Exports
- **Single export per file**: Every component gets its own file
- **Export name matches file name**: `Button.tsx` exports `Button`
- **No default exports**: Always use named exports for predictability
- **Props interface**: Always named `<ComponentName>Props`

#### Component Types

**Atoms**: `PascalCase` nouns describing the primitive
```typescript
// ✅ Good
export function Button({ children, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants[variant])} {...props}>{children}</button>
}

// ❌ Bad - has business logic
export function LoginButton() {
  const { signIn } = useAuth() // ❌ Business logic in atom
  return <button onClick={() => signIn()}>Login</button>
}
```

**Molecules**: `PascalCase` describing the combination purpose
```typescript
// ✅ Good
export function SearchField({ onSearch, placeholder }: SearchFieldProps) {
  return (
    <div className="flex gap-2">
      <Input placeholder={placeholder} />
      <Button onClick={onSearch}>Search</Button>
    </div>
  )
}
```

**Organisms**: `PascalCase` describing the system function
```typescript
// ✅ Good
export function HeaderNav() {
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useAuth() // ✅ Business logic allowed
  
  return (
    <header>
      <Navigation />
      <AuthActions user={user} />
    </header>
  )
}
```

### Import Conventions

```typescript
// Atomic hierarchy (global reusable)
import { Button } from '@/atoms/Button'
import { AuthActions } from '@/molecules/AuthActions'
import { HeaderNav } from '@/organisms/HeaderNav'

// Feature-specific (domain-bounded)
import { ClaimHandleForm } from '@/components/home/ClaimHandleForm'
import { ProfileForm } from '@/components/dashboard/organisms/ProfileForm'
```

## Component Rules by Type

### Atoms
- **Zero business logic** - no API calls, no feature dependencies
- **Highly reusable** - used across multiple features
- **Props-driven** - behavior controlled entirely by props
- **ForwardRef required** for DOM elements
- **DisplayName required** for debugging

```typescript
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants[variant], className)}
        data-testid="button"
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
```

### Molecules
- **Single clear purpose** - solve one specific UI pattern
- **Minimal state** - preferably stateless, controlled by parent
- **Composable** - accept children and handlers for flexibility
- **No complex business logic** - move to organisms if needed

```typescript
export function SearchField({ value, onChange, onSubmit, placeholder }: SearchFieldProps) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid="search-input"
      />
      <Button type="submit" data-testid="search-button">
        Search
      </Button>
    </form>
  )
}
```

### Organisms
- **Complex systems** with multiple responsibilities
- **State management** - can use `useState`, `useEffect`, etc.
- **API integration** - can make API calls and handle data
- **Business logic** - can contain feature-specific logic
- **Self-contained** - should work independently

```typescript
export function ProductFlyout({ productId }: ProductFlyoutProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: product, isLoading } = useProduct(productId)
  
  const handlePurchase = async () => {
    await purchaseProduct(productId)
    setIsOpen(false)
  }
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">View Product</Button>
      </PopoverTrigger>
      <PopoverContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <ProductDetails product={product} onPurchase={handlePurchase} />
        )}
      </PopoverContent>
    </Popover>
  )
}
```

## Nested Atomic Structure Rules

Feature-level nesting is allowed, but each level has strict scope boundaries.

### Allowed

```text
components/
└── dashboard/
    ├── atoms/
    ├── molecules/
    └── organisms/
```

- `dashboard/atoms/*` can only contain dashboard-specific presentational primitives.
- If a feature atom is reused outside its feature, promote it to `components/atoms/*`.
- Feature molecules and organisms can compose feature atoms, but global atoms should remain dependency-free.

### Not Allowed

- Adding business logic hooks (`useState`, `useEffect`, `useQuery`, custom `useX`) inside any `atoms/` directory.
- Importing feature services, API clients, or route-specific state directly in atoms.
- Keeping "temporary" atoms in a feature folder once they are reused globally.

### Enforcement

- ESLint blocks hook calls in `apps/web/components/atoms/**/*.tsx`.
- Existing legacy exceptions are tracked and must be migrated using `docs/ATOMIC_MIGRATION_GUIDE.md`.

## Feature Organization

When components are specific to a feature domain:

```
components/
└── dashboard/
    ├── atoms/        # Dashboard-specific atoms
    ├── molecules/    # Dashboard-specific molecules
    ├── organisms/    # Dashboard-specific organisms
    └── index.ts      # Export all dashboard components
```

## Testing Strategy by Component Type

### Atoms
```typescript
describe('Button', () => {
  it('applies variant classes correctly', () => {
    render(<Button variant="primary">Click</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600')
  })
  
  it('forwards ref correctly', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Click</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})
```

### Molecules
```typescript
describe('SearchField', () => {
  it('calls onSubmit when form is submitted', () => {
    const onSubmit = vi.fn()
    render(<SearchField onSubmit={onSubmit} />)
    
    fireEvent.submit(screen.getByRole('form'))
    expect(onSubmit).toHaveBeenCalled()
  })
})
```

### Organisms
```typescript
describe('ProductFlyout', () => {
  it('loads and displays product data', async () => {
    mockUseProduct.mockReturnValue({ data: mockProduct, isLoading: false })
    
    render(<ProductFlyout productId="123" />)
    
    fireEvent.click(screen.getByText('View Product'))
    await waitFor(() => {
      expect(screen.getByText(mockProduct.name)).toBeVisible()
    })
  })
})
```

## Accessibility Requirements

### All Components
- **ARIA labels**: For screen readers when text isn't sufficient
- **Keyboard navigation**: Tab order and keyboard interactions
- **Focus management**: Visible focus indicators

### Interactive Components
```typescript
export function Button({ children, ...props }: ButtonProps) {
  return (
    <button
      className="focus-ring" // Standard focus utility
      {...props}
    >
      {children}
    </button>
  )
}
```

## data-testid Strategy

> **Canonical reference:** See `agents.md` section 8.1.1 for the full policy.

### Philosophy
Selective and purposeful, not exhaustive. Prefer accessibility-based selectors (`getByRole`, `getByLabelText`) in tests. Add `data-testid` only when those selectors cannot reliably target an element.

### Requirements by Tier

| Tier | Requirement | Example |
|------|-------------|---------|
| **Organisms** | **REQUIRED** | `data-testid="profile-form"` on root, `data-testid="profile-save-button"` on submit |
| **Molecules** | **RECOMMENDED** | Add when used in E2E/critical flows |
| **Atoms** | **OPTIONAL** | Accept via props: `'data-testid'?: string` |

### When to Add
- Critical paths: auth, checkout, onboarding
- Dynamic content: list items, cards (`data-testid="link-item-{id}"`)
- Conditional UI: elements that appear/disappear
- E2E smoke test entry points

### When to Skip
- Semantic HTML: use `getByRole('button')` instead
- Static content: use `getByText('Welcome')`
- Elements with clear accessibility selectors

### Naming Convention
```
✅ data-testid="profile-save-button"
✅ data-testid="onboarding-step-2"
✅ data-testid="link-item-{id}"
❌ data-testid="btn1"
❌ data-testid="ProfileSaveButton"
```

### Atom Pattern (Accept via Props)
```typescript
interface ButtonProps {
  children: React.ReactNode;
  'data-testid'?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, 'data-testid': testId, ...props }, ref) => (
    <button ref={ref} data-testid={testId} {...props}>
      {children}
    </button>
  )
);
```

### Organism Pattern (Required on Root + Key Areas)
```typescript
export function ProfileForm({ onSave }: ProfileFormProps) {
  return (
    <form data-testid="profile-form" onSubmit={onSave}>
      <Input name="displayName" />
      <Button type="submit" data-testid="profile-save-button">
        Save
      </Button>
    </form>
  );
}
```

## Component Generator Usage

Use `pnpm generate` to scaffold new components:

```bash
# Create a new atom
pnpm generate atom
# → Prompts for name
# → Creates Button.tsx, Button.stories.tsx, Button.test.tsx
# → Updates atoms/index.ts

# Create a feature component
pnpm generate feature
# → Prompts for feature, atomic level, name
# → Creates in appropriate feature directory
```

## Atomic Enforcement Workflow

When adding or editing atoms:

1. Keep atom files props-driven and side-effect free.
2. Move hook-based behavior into a colocated molecule or organism.
3. Pass derived state to atoms through explicit props.
4. If ESLint fails with "Hooks are not allowed in atoms," follow `docs/ATOMIC_MIGRATION_GUIDE.md`.

## Migration and Refactoring

### When to Refactor
1. **Atom becomes complex**: Move business logic to organism
2. **Molecule needs state**: Extract state to parent or move to organism
3. **Component used in 3+ places**: Move to shared atomic hierarchy
4. **Feature component becomes generic**: Move to atoms/molecules/organisms

### Refactoring Checklist
- [ ] Update imports in all consuming files
- [ ] Move tests and stories
- [ ] Update Storybook hierarchy
- [ ] Check for breaking changes in props
- [ ] Verify all tests still pass

## Common Patterns

### Compound Components
```typescript
// Expose sub-components as properties
export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
}

// Usage
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Title>Title</Dialog.Title>
    <Dialog.Description>Description</Dialog.Description>
  </Dialog.Content>
</Dialog.Root>
```

### Polymorphic Components
```typescript
type ButtonProps<T extends ElementType = 'button'> = {
  as?: T
} & ComponentPropsWithoutRef<T>

export function Button<T extends ElementType = 'button'>({ 
  as, 
  children, 
  ...props 
}: ButtonProps<T>) {
  const Component = as || 'button'
  return <Component {...props}>{children}</Component>
}

// Usage
<Button as="a" href="/link">Link Button</Button>
```

## Best Practices Summary

✅ **Do**:
- Search existing components before creating new ones
- Use TypeScript interfaces for all props
- Add `data-testid` to organisms (required) and molecules in critical flows (recommended)
- Accept `data-testid` as optional prop in atoms
- Write comprehensive Storybook stories
- Follow naming conventions consistently
- Keep components focused and single-purpose
- Use forwardRef for DOM elements
- Include accessibility attributes (semantic HTML, ARIA)

❌ **Don't**:
- Put business logic in atoms
- Add `data-testid` to every element (use accessibility selectors first)
- Create overly generic components
- Use default exports
- Skip tests for new components
- Ignore accessibility requirements
- Create components without clear purpose
- Mix atomic levels within a component
- Skip TypeScript types
