import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

describe('Card', () => {
  it('renders with default variant', () => {
    render(<Card data-testid='card'>Card content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('rounded-lg');
    expect(card.className).toContain('border-subtle');
    expect(card.className).toContain('bg-surface-1');
  });

  it('applies hoverable variant classes', () => {
    render(
      <Card variant='hoverable' data-testid='card'>
        Card content
      </Card>
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('hover:bg-surface-2');
    expect(card.className).toContain('hover:shadow-card-elevated');
    expect(card.className).toContain('cursor-pointer');
    expect(card.className).toContain('motion-reduce:transition-none');
  });

  it('forwards refs correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>Card content</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has correct displayName', () => {
    expect(Card.displayName).toBe('Card');
  });

  it('supports asChild with article element', () => {
    render(
      <Card asChild>
        <article data-testid='article'>Article content</article>
      </Card>
    );
    const article = screen.getByTestId('article');
    expect(article.tagName).toBe('ARTICLE');
    expect(article.className).toContain('rounded-lg');
  });

  it('supports asChild with section element', () => {
    render(
      <Card asChild>
        <section data-testid='section'>Section content</section>
      </Card>
    );
    const section = screen.getByTestId('section');
    expect(section.tagName).toBe('SECTION');
    expect(section.className).toContain('bg-surface-1');
  });

  it('merges custom className with default classes', () => {
    render(
      <Card className='custom-class' data-testid='card'>
        Content
      </Card>
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('custom-class');
    expect(card.className).toContain('rounded-lg');
  });

  it('passes through HTML attributes', () => {
    render(
      <Card id='test-id' role='region'>
        Content
      </Card>
    );
    const card = screen.getByRole('region');
    expect(card).toHaveAttribute('id', 'test-id');
  });
});

describe('CardHeader', () => {
  it('renders with default classes', () => {
    render(<CardHeader data-testid='header'>Header content</CardHeader>);
    const header = screen.getByTestId('header');
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('flex');
    expect(header.className).toContain('flex-col');
    expect(header.className).toContain('space-y-1.5');
    expect(header.className).toContain('p-6');
  });

  it('forwards refs correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardHeader ref={ref}>Header content</CardHeader>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has correct displayName', () => {
    expect(CardHeader.displayName).toBe('CardHeader');
  });

  it('supports asChild', () => {
    render(
      <CardHeader asChild>
        <header data-testid='semantic-header'>Header content</header>
      </CardHeader>
    );
    const header = screen.getByTestId('semantic-header');
    expect(header.tagName).toBe('HEADER');
    expect(header.className).toContain('flex');
  });
});

describe('CardTitle', () => {
  it('renders as h3 by default', () => {
    render(<CardTitle>Title text</CardTitle>);
    const title = screen.getByRole('heading', { level: 3 });
    expect(title).toBeInTheDocument();
    expect(title.className).toContain('text-2xl');
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('text-primary-token');
  });

  it('forwards refs correctly', () => {
    const ref = React.createRef<HTMLHeadingElement>();
    render(<CardTitle ref={ref}>Title</CardTitle>);
    expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
  });

  it('has correct displayName', () => {
    expect(CardTitle.displayName).toBe('CardTitle');
  });

  it('supports asChild with different heading levels', () => {
    render(
      <CardTitle asChild>
        <h1>Main title</h1>
      </CardTitle>
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toBeInTheDocument();
    expect(title.className).toContain('text-2xl');
  });

  it('supports asChild with non-heading elements', () => {
    render(
      <CardTitle asChild>
        <span data-testid='span-title'>Span title</span>
      </CardTitle>
    );
    const title = screen.getByTestId('span-title');
    expect(title.tagName).toBe('SPAN');
    expect(title.className).toContain('font-semibold');
  });
});

describe('CardDescription', () => {
  it('renders as paragraph by default', () => {
    render(<CardDescription>Description text</CardDescription>);
    const description = screen.getByText('Description text');
    expect(description.tagName).toBe('P');
    expect(description.className).toContain('text-sm');
    expect(description.className).toContain('text-secondary-token');
  });

  it('forwards refs correctly', () => {
    const ref = React.createRef<HTMLParagraphElement>();
    render(<CardDescription ref={ref}>Description</CardDescription>);
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
  });

  it('has correct displayName', () => {
    expect(CardDescription.displayName).toBe('CardDescription');
  });

  it('supports asChild', () => {
    render(
      <CardDescription asChild>
        <div data-testid='div-description'>Div description</div>
      </CardDescription>
    );
    const description = screen.getByTestId('div-description');
    expect(description.tagName).toBe('DIV');
    expect(description.className).toContain('text-sm');
  });
});

describe('CardContent', () => {
  it('renders with default classes', () => {
    render(<CardContent data-testid='content'>Content text</CardContent>);
    const content = screen.getByTestId('content');
    expect(content).toBeInTheDocument();
    expect(content.className).toContain('p-6');
    expect(content.className).toContain('pt-0');
  });

  it('forwards refs correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardContent ref={ref}>Content</CardContent>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has correct displayName', () => {
    expect(CardContent.displayName).toBe('CardContent');
  });

  it('supports asChild', () => {
    render(
      <CardContent asChild>
        <main data-testid='main-content'>Main content</main>
      </CardContent>
    );
    const content = screen.getByTestId('main-content');
    expect(content.tagName).toBe('MAIN');
    expect(content.className).toContain('p-6');
  });
});

describe('CardFooter', () => {
  it('renders with default classes', () => {
    render(<CardFooter data-testid='footer'>Footer content</CardFooter>);
    const footer = screen.getByTestId('footer');
    expect(footer).toBeInTheDocument();
    expect(footer.className).toContain('flex');
    expect(footer.className).toContain('items-center');
    expect(footer.className).toContain('p-6');
    expect(footer.className).toContain('pt-0');
  });

  it('forwards refs correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardFooter ref={ref}>Footer</CardFooter>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has correct displayName', () => {
    expect(CardFooter.displayName).toBe('CardFooter');
  });

  it('supports asChild', () => {
    render(
      <CardFooter asChild>
        <footer data-testid='semantic-footer'>Footer content</footer>
      </CardFooter>
    );
    const footer = screen.getByTestId('semantic-footer');
    expect(footer.tagName).toBe('FOOTER');
    expect(footer.className).toContain('flex');
  });
});

describe('Card composition', () => {
  it('renders complete card structure', () => {
    render(
      <Card data-testid='card'>
        <CardHeader data-testid='header'>
          <CardTitle data-testid='title'>Test Title</CardTitle>
          <CardDescription data-testid='description'>
            Test Description
          </CardDescription>
        </CardHeader>
        <CardContent data-testid='content'>Test Content</CardContent>
        <CardFooter data-testid='footer'>Test Footer</CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(screen.getByTestId('description')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('works with semantic HTML structure', () => {
    render(
      <Card asChild>
        <article data-testid='article'>
          <CardHeader asChild>
            <header data-testid='header'>
              <CardTitle asChild>
                <h1 data-testid='title'>Article Title</h1>
              </CardTitle>
              <CardDescription data-testid='description'>
                Article description
              </CardDescription>
            </header>
          </CardHeader>
          <CardContent asChild>
            <main data-testid='content'>Article content</main>
          </CardContent>
          <CardFooter asChild>
            <footer data-testid='footer'>Article footer</footer>
          </CardFooter>
        </article>
      </Card>
    );

    const article = screen.getByTestId('article');
    const header = screen.getByTestId('header');
    const title = screen.getByTestId('title');
    const content = screen.getByTestId('content');
    const footer = screen.getByTestId('footer');

    expect(article.tagName).toBe('ARTICLE');
    expect(header.tagName).toBe('HEADER');
    expect(title.tagName).toBe('H1');
    expect(content.tagName).toBe('MAIN');
    expect(footer.tagName).toBe('FOOTER');

    // Verify classes are still applied
    expect(article.className).toContain('rounded-lg');
    expect(header.className).toContain('flex');
    expect(title.className).toContain('text-2xl');
  });
});
