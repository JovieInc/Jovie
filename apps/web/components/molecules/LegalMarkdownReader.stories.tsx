import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LegalMarkdownReader } from './LegalMarkdownReader';

const sampleHtml = `
  <h2>1. Overview</h2>
  <p>This document describes how Jovie handles your data and account.</p>
  <h3>1.1 Scope</h3>
  <p>Applies to every artist profile created on the platform.</p>
  <ul>
    <li>We collect only what's needed to run the service.</li>
    <li>We never sell your data.</li>
  </ul>
`;

const meta = {
  title: 'Molecules/LegalMarkdownReader',
  component: LegalMarkdownReader,
  parameters: {
    layout: 'padded',
  },
  args: {
    html: sampleHtml,
  },
} satisfies Meta<typeof LegalMarkdownReader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCustomClassName: Story = {
  args: {
    className: 'max-w-2xl',
  },
};
