# Notification Guidelines

This document outlines when and how to use different types of notifications in the Jovie application.

## Overview

Jovie uses a unified toast notification system that provides consistent user feedback across the application. This system is built on top of a custom React context and provides both basic toast functionality and enhanced convenience methods.

## When to Use Toasts vs Console Logging

### ✅ Use Toasts For:

- **User-actionable feedback**: When users need to know the result of their actions
- **Form validation errors**: Field-specific or form-wide validation messages
- **Success confirmations**: When operations complete successfully
- **Network errors**: When API calls fail and users should retry
- **File upload feedback**: Progress, success, or error states
- **Copy/paste confirmations**: When content is copied to clipboard
- **Undo operations**: Allowing users to reverse recent actions
- **Warning messages**: When users should be aware of potential issues

### ❌ Don't Use Toasts For:

- **Technical/debugging errors**: Stack traces, development warnings
- **Server-side logging**: API errors that should only be logged
- **Frequent updates**: Real-time data that changes constantly
- **Non-critical information**: Debug information, performance metrics
- **Automatic processes**: Background tasks users didn't initiate

## Toast Types and Usage

### Success Toasts
Use for positive feedback when operations complete successfully.

```typescript
import { useNotifications } from '@/lib/hooks/useNotifications';

const notifications = useNotifications();

// Generic success
notifications.success('Operation completed successfully!');

// Predefined patterns
notifications.saveSuccess();
notifications.uploadSuccess();
```

### Error Toasts
Use for errors that users can understand and potentially fix.

```typescript
// Generic error
notifications.error('Something went wrong. Please try again.');

// Predefined patterns
notifications.saveError();
notifications.networkError();

// With retry action
notifications.retry('Upload failed', () => {
  // Retry logic here
});
```

### Info Toasts
Use for neutral information that users should be aware of.

```typescript
// Generic info
notifications.info('Your changes are being processed...');

// With loading state
const result = await notifications.withLoadingToast(
  apiCall(),
  {
    loadingMessage: 'Saving changes...',
    successMessage: 'Changes saved!',
    errorMessage: 'Failed to save changes'
  }
);
```

### Warning Toasts
Use for situations that require user attention but aren't errors.

```typescript
notifications.warning('You have unsaved changes that will be lost');
```

## Error Handling Patterns

### Client-Side Errors

```typescript
try {
  await saveUserProfile(data);
  notifications.saveSuccess();
} catch (error) {
  // This will show user-friendly messages and log technical errors
  notifications.handleError(error, 'Failed to save profile');
}
```

### Form Validation

```typescript
// Field-specific errors
if (!email) {
  notifications.error('Please enter your email address');
  return;
}

if (!isValidEmail(email)) {
  notifications.error('Please enter a valid email address');
  return;
}
```

### Network Requests

```typescript
const handleApiCall = async () => {
  try {
    const result = await notifications.withLoadingToast(
      fetch('/api/data').then(r => r.json()),
      {
        loadingMessage: 'Loading data...',
        successMessage: 'Data loaded successfully',
        // Error message will be auto-generated from the error
      }
    );
    
    setData(result);
  } catch (error) {
    // Error toast already shown by withLoadingToast
    console.error('API call failed:', error);
  }
};
```

## Advanced Patterns

### Undo Operations

```typescript
const handleDelete = (item: Item) => {
  // Optimistically remove from UI
  setItems(items => items.filter(i => i.id !== item.id));
  
  // Show undo toast
  notifications.undo(
    `Deleted ${item.name}`,
    () => {
      // Restore item
      setItems(items => [...items, item]);
      notifications.success('Item restored');
    }
  );
  
  // Actually delete after undo timeout
  setTimeout(() => {
    deleteItemFromServer(item.id);
  }, 8000);
};
```

### Action Toasts

```typescript
notifications.info('File uploaded successfully', {
  action: {
    label: 'View File',
    onClick: () => openFile(fileId)
  }
});
```

### Custom Duration

```typescript
// Longer duration for important messages
notifications.error('Payment failed. Please check your card details.', {
  duration: 10000 // 10 seconds
});

// Persistent toast (manual dismiss only)
notifications.info('System maintenance starting in 5 minutes', {
  duration: 0 // Won't auto-dismiss
});
```

## Error Boundaries

The application includes error boundaries that automatically show toast notifications for unhandled errors:

```typescript
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';

// Wrap components that might throw errors
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// Or use the HOC
const SafeComponent = withErrorBoundary(MyComponent);
```

## Best Practices

### Message Writing

- **Be specific**: "Failed to save profile" vs "Something went wrong"
- **Be actionable**: Include what users can do next
- **Be concise**: Keep messages under 100 characters when possible
- **Use consistent tone**: Friendly but professional

### Timing

- **Success messages**: 4 seconds (quick confirmation)
- **Error messages**: 6 seconds (more time to read)
- **Action toasts**: 8 seconds (time to interact)
- **Critical warnings**: 10+ seconds or manual dismiss

### Accessibility

- Error toasts use `aria-live="assertive"` for immediate announcement
- Other toasts use `aria-live="polite"` to not interrupt screen readers
- All toasts include proper ARIA labels and roles

### Performance

- The system automatically deduplicates identical messages
- Maximum of 5 concurrent toasts to avoid overwhelming users
- Toasts are automatically cleaned up on component unmount

## Migration from Legacy Patterns

### Replace alert() calls

```typescript
// ❌ Old way
alert('Button clicked!');

// ✅ New way
notifications.success('Button clicked! 🎉');
```

### Replace console.error for user-facing errors

```typescript
// ❌ Old way
try {
  await saveData();
} catch (error) {
  console.error('Save failed:', error);
}

// ✅ New way
try {
  await saveData();
  notifications.saveSuccess();
} catch (error) {
  notifications.handleError(error, 'Failed to save data');
}
```

### Replace custom error handling

```typescript
// ❌ Old way
const [error, setError] = useState<string>();

if (error) {
  return <div className="error">{error}</div>;
}

// ✅ New way
// Errors are shown as toasts, no need for error state in most cases
const handleSubmit = async () => {
  try {
    await submitForm();
    notifications.success('Form submitted successfully!');
  } catch (error) {
    notifications.handleError(error);
  }
};
```

## Testing

When testing components that use notifications:

```typescript
import { ToastProvider } from '@/components/providers/ToastProvider';
import { render } from '@testing-library/react';

const renderWithToasts = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      {ui}
    </ToastProvider>
  );
};

// Mock the notifications hook if needed
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
    // ... other methods
  }),
}));
```

## Common Patterns Reference

```typescript
// File upload
notifications.withLoadingToast(
  uploadFile(file),
  {
    loadingMessage: 'Uploading file...',
    successMessage: 'File uploaded successfully',
    errorMessage: 'Upload failed. Please try again.'
  }
);

// Form submission
try {
  await submitForm(data);
  notifications.success('Form submitted successfully!');
  router.push('/success');
} catch (error) {
  notifications.handleError(error, 'Failed to submit form');
}

// Copy to clipboard
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    notifications.success('Copied to clipboard!');
  } catch (error) {
    notifications.error('Failed to copy to clipboard');
  }
};

// Bulk operations
const handleBulkDelete = async (items: Item[]) => {
  const toastId = notifications.info(`Deleting ${items.length} items...`, { duration: 0 });
  
  try {
    await deleteBulkItems(items.map(i => i.id));
    notifications.hideToast(toastId);
    notifications.success(`Deleted ${items.length} items successfully`);
  } catch (error) {
    notifications.hideToast(toastId);
    notifications.error('Failed to delete some items');
  }
};
```
