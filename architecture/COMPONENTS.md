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
- **Test IDs**: Use `data-testid` in kebab-case
- **ARIA labels**: For screen readers when text isn't sufficient
- **Keyboard navigation**: Tab order and keyboard interactions
- **Focus management**: Visible focus indicators

### Interactive Components
```typescript
export function Button({ children, ...props }: ButtonProps) {
  return (
    <button
      className="focus-ring" // Standard focus utility
      data-testid="button"
      {...props}
    >
      {children}
    </button>
  )
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
- Include data-testid for testing
- Write comprehensive Storybook stories
- Follow naming conventions consistently
- Keep components focused and single-purpose
- Use forwardRef for DOM elements
- Include accessibility attributes

❌ **Don't**:
- Put business logic in atoms
- Create overly generic components
- Use default exports
- Skip tests for new components
- Ignore accessibility requirements
- Create components without clear purpose
- Mix atomic levels within a component
- Skip TypeScript types
