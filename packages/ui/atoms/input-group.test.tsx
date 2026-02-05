import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';
import { InputGroup } from './input-group';

// Mock icon component
const MockIcon = ({ ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg data-slot='icon' aria-hidden='true' {...props}>
    <circle cx='12' cy='12' r='10' />
  </svg>
);

describe('InputGroup', () => {
  describe('Basic Rendering', () => {
    it('renders children', () => {
      render(
        <InputGroup>
          <Input placeholder='Enter text' />
        </InputGroup>
      );
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('renders with data-slot attribute', () => {
      render(
        <InputGroup data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group).toHaveAttribute('data-slot', 'control');
    });

    it('applies relative positioning', () => {
      render(
        <InputGroup data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain('relative');
    });
  });

  describe('Icon Positioning', () => {
    it('renders leading icon', () => {
      render(
        <InputGroup>
          <MockIcon data-testid='leading-icon' />
          <Input placeholder='Search' />
        </InputGroup>
      );
      expect(screen.getByTestId('leading-icon')).toBeInTheDocument();
    });

    it('renders trailing icon', () => {
      render(
        <InputGroup>
          <Input placeholder='Email' />
          <MockIcon data-testid='trailing-icon' />
        </InputGroup>
      );
      expect(screen.getByTestId('trailing-icon')).toBeInTheDocument();
    });

    it('renders both leading and trailing icons', () => {
      render(
        <InputGroup>
          <MockIcon data-testid='leading-icon' />
          <Input placeholder='Password' />
          <MockIcon data-testid='trailing-icon' />
        </InputGroup>
      );
      expect(screen.getByTestId('leading-icon')).toBeInTheDocument();
      expect(screen.getByTestId('trailing-icon')).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('applies md size by default', () => {
      render(
        <InputGroup data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      // md size uses specific padding classes for icons
      expect(group.className).toContain(
        '[&>[data-slot=icon]:first-child~input]:pl-10'
      );
    });

    it('applies sm size', () => {
      render(
        <InputGroup size='sm' data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain(
        '[&>[data-slot=icon]:first-child~input]:pl-8'
      );
    });

    it('applies lg size', () => {
      render(
        <InputGroup size='lg' data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain(
        '[&>[data-slot=icon]:first-child~input]:pl-12'
      );
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(
        <InputGroup data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain('relative');
      expect(group.className).toContain('isolate');
      expect(group.className).toContain('block');
      expect(group.className).toContain('w-full');
    });

    it('applies icon pointer-events-none', () => {
      render(
        <InputGroup data-testid='input-group'>
          <MockIcon />
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain(
        '[&>[data-slot=icon]]:pointer-events-none'
      );
    });

    it('applies icon positioning classes', () => {
      render(
        <InputGroup data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain('[&>[data-slot=icon]]:absolute');
      expect(group.className).toContain('[&>[data-slot=icon]]:top-1/2');
      expect(group.className).toContain(
        '[&>[data-slot=icon]]:-translate-y-1/2'
      );
    });

    it('applies icon color class', () => {
      render(
        <InputGroup data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain(
        '[&>[data-slot=icon]]:text-tertiary-token'
      );
    });

    it('merges custom className', () => {
      render(
        <InputGroup className='custom-class' data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group.className).toContain('custom-class');
      expect(group.className).toContain('relative');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <InputGroup id='custom-id' data-testid='input-group'>
          <Input />
        </InputGroup>
      );
      const group = screen.getByTestId('input-group');
      expect(group).toHaveAttribute('id', 'custom-id');
    });
  });
});
