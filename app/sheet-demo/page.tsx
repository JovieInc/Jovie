import React from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/packages/ui/atoms/sheet';

export default function SheetDemo() {
  return (
    <div className="min-h-screen bg-base p-8 space-y-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-primary-token mb-8">
          Enhanced Sheet Component Demo
        </h1>
        
        {/* Basic Examples */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-primary-token">Basic Examples</h2>
          <div className="grid grid-cols-2 gap-4">
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <Sheet key={side}>
                <SheetTrigger asChild>
                  <button className="w-full p-4 bg-btn-primary text-btn-primary-foreground rounded-lg hover:bg-btn-primary/90 transition-colors">
                    Open {side.charAt(0).toUpperCase() + side.slice(1)} Sheet
                  </button>
                </SheetTrigger>
                <SheetContent side={side}>
                  <SheetHeader>
                    <SheetTitle>{side.charAt(0).toUpperCase() + side.slice(1)} Sheet</SheetTitle>
                    <SheetDescription>
                      This sheet slides in from the {side}. It features Apple-level polish 
                      with smooth animations and proper accessibility.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4 flex-1">
                    <p className="text-sm text-secondary-token mb-4">
                      Features demonstrated:
                    </p>
                    <ul className="text-sm text-secondary-token space-y-2">
                      <li>✓ Radix UI Dialog for robust accessibility</li>
                      <li>✓ Focus trapping and keyboard navigation</li>
                      <li>✓ Tokenized Tailwind v4 styling</li>
                      <li>✓ Reduced motion support</li>
                      <li>✓ SSR safe implementation</li>
                      <li>✓ Customizable sizes and positions</li>
                    </ul>
                  </div>
                  <SheetFooter>
                    <SheetClose asChild>
                      <button className="px-4 py-2 bg-surface-2 text-primary-token rounded-md hover:bg-surface-3 transition-colors">
                        Close
                      </button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            ))}
          </div>
        </section>

        {/* Size Examples */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-primary-token">Size Variants</h2>
          <div className="grid grid-cols-3 gap-4">
            {(['sm', 'default', 'lg', 'xl', 'full'] as const).map((size) => (
              <Sheet key={size}>
                <SheetTrigger asChild>
                  <button className="w-full p-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors">
                    {size === 'default' ? 'Default' : size.toUpperCase()} Size
                  </button>
                </SheetTrigger>
                <SheetContent size={size}>
                  <SheetHeader>
                    <SheetTitle>{size === 'default' ? 'Default' : size.toUpperCase()} Size Sheet</SheetTitle>
                    <SheetDescription>
                      This demonstrates the {size} size variant with responsive width control.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4 flex-1">
                    <div className="p-4 bg-surface-2 rounded-lg">
                      <h3 className="font-medium text-primary-token mb-2">Size Information:</h3>
                      <ul className="text-sm text-secondary-token space-y-1">
                        <li>Size: {size}</li>
                        <li>Responsive: ✓</li>
                        <li>Mobile optimized: ✓</li>
                      </ul>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            ))}
          </div>
        </section>

        {/* Form Example */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-primary-token">Form Integration</h2>
          <Sheet>
            <SheetTrigger asChild>
              <button className="w-full p-6 bg-surface-1 border border-subtle rounded-xl hover:bg-surface-2 transition-colors text-left">
                <div className="text-lg font-medium text-primary-token">Open Contact Form</div>
                <div className="text-sm text-secondary-token mt-1">
                  Demonstrates form integration with proper focus management
                </div>
              </button>
            </SheetTrigger>
            <SheetContent size="lg">
              <SheetHeader>
                <SheetTitle>Contact Us</SheetTitle>
                <SheetDescription>
                  Fill out this form to get in touch. Notice how focus is properly managed.
                </SheetDescription>
              </SheetHeader>
              <form className="space-y-4 flex-1 py-4">
                <div className="space-y-2">
                  <label htmlFor="demo-name" className="text-sm font-medium text-primary-token">
                    Name
                  </label>
                  <input
                    id="demo-name"
                    type="text"
                    className="w-full px-3 py-2 bg-surface-1 border border-subtle rounded-md text-primary-token focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="demo-email" className="text-sm font-medium text-primary-token">
                    Email
                  </label>
                  <input
                    id="demo-email"
                    type="email"
                    className="w-full px-3 py-2 bg-surface-1 border border-subtle rounded-md text-primary-token focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="your.email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="demo-message" className="text-sm font-medium text-primary-token">
                    Message
                  </label>
                  <textarea
                    id="demo-message"
                    rows={4}
                    className="w-full px-3 py-2 bg-surface-1 border border-subtle rounded-md text-primary-token focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                    placeholder="Your message..."
                  />
                </div>
              </form>
              <SheetFooter>
                <SheetClose asChild>
                  <button className="px-4 py-2 bg-surface-2 text-primary-token rounded-md hover:bg-surface-3 transition-colors">
                    Cancel
                  </button>
                </SheetClose>
                <button className="px-4 py-2 bg-btn-primary text-btn-primary-foreground rounded-md hover:bg-btn-primary/90 transition-colors">
                  Send Message
                </button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </section>
      </div>
    </div>
  );
}