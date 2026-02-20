import { setProjectAnnotations } from '@storybook/nextjs-vite';
import * as previewAnnotations from './preview';

const annotations = setProjectAnnotations([previewAnnotations]);
beforeAll(annotations.beforeAll);
