import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Label } from './label';

describe('Label', () => {
  describe('Basic Rendering', () => {
    it('renders with text content', () => {
      render(<Label>Email</Label>);
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('renders as label element', () => {
      render(<Label data-testid='label'>Email</Label>);
      const label = screen.getByTestId('label');
      expect(label.tagName).toBe('LABEL');
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLLabelElement>();
      render(<Label ref={ref}>Email</Label>);
      expect(ref.current).toBeInstanceOf(HTMLLabelElement);
    });
  });

  describe('Variants', () => {
    it('applies default variant classes', () => {
      render(<Label data-testid='label'>Email</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-foreground');
    });

    it('applies muted variant classes', () => {
      render(
        <Label variant='muted' data-testid='label'>
          Optional
        </Label>
      );
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-muted-foreground');
    });

    it('applies error variant classes', () => {
      render(
        <Label variant='error' data-testid='label'>
          Invalid
        </Label>
      );
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-destructive');
    });
  });

  describe('Required Indicator', () => {
    it('shows required indicator when required is true', () => {
      render(<Label required>Email</Label>);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('includes screen reader text for required', () => {
      render(<Label required>Email</Label>);
      expect(screen.getByText('(required)')).toBeInTheDocument();
    });

    it('does not show required indicator when required is false', () => {
      render(<Label>Email</Label>);
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });

    it('hides asterisk from screen readers', () => {
      render(<Label required>Email</Label>);
      const asterisk = screen.getByText('*');
      expect(asterisk).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Styling', () => {
    it('applies base text styling', () => {
      render(<Label data-testid='label'>Email</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-sm');
      expect(label.className).toContain('font-medium');
      expect(label.className).toContain('leading-none');
    });

    it('applies peer-disabled styles', () => {
      render(<Label data-testid='label'>Email</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('peer-disabled:cursor-not-allowed');
      expect(label.className).toContain('peer-disabled:opacity-70');
    });

    it('merges custom className', () => {
      render(
        <Label className='custom-class' data-testid='label'>
          Email
        </Label>
      );
      const label = screen.getByTestId('label');
      expect(label.className).toContain('custom-class');
      expect(label.className).toContain('text-sm');
    });
  });

  describe('Association with Form Controls', () => {
    it('supports htmlFor prop', () => {
      render(<Label htmlFor='email-input'>Email</Label>);
      const label = screen.getByText('Email');
      expect(label).toHaveAttribute('for', 'email-input');
    });

    it('associates with input when used together', () => {
      render(
        <div>
          <Label htmlFor='test-input'>Email</Label>
          <input id='test-input' type='email' />
        </div>
      );
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('type', 'email');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <Label id='custom-id' data-custom='value' data-testid='label'>
          Email
        </Label>
      );
      const label = screen.getByTestId('label');
      expect(label).toHaveAttribute('id', 'custom-id');
      expect(label).toHaveAttribute('data-custom', 'value');
    });
  });
});
