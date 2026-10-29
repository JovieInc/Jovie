import assert from 'node:assert/strict';
import test from 'node:test';
import { findOffenders } from './lint-composite-field.mjs';

test('flags an input that drops its own focus outside CompositeField', () => {
  const src = `<div className='rounded-full'><input className='bg-transparent outline-none' /></div>`;
  assert.equal(findOffenders(src).length, 1);
});

test('flags focus-visible:ring-0 on an Input', () => {
  const src = `<Input className='border-0 focus-visible:ring-0' />`;
  assert.equal(findOffenders(src).length, 1);
});

test('allows the same input inside CompositeField', () => {
  const src = `import { CompositeField } from '@jovie/ui/atoms/composite-field';
<CompositeField><input className='bg-transparent outline-none' /></CompositeField>`;
  assert.equal(findOffenders(src).length, 0);
});

test('allows an input that paints its own ring', () => {
  const src = `<input className='focus-visible:outline-none focus-visible:ring-2' />`;
  assert.equal(findOffenders(src).length, 0);
});
