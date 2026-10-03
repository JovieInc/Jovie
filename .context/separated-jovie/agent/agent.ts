import { defineAgent } from 'eve';
import { assertRuntimeEnvironment } from './lib/application-boundary';
assertRuntimeEnvironment();
export default defineAgent({ model: 'zai/glm-5.3-flash' });
