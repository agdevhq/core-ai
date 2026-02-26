import 'dotenv/config';
import { registerProviderSuite } from './provider-suite.ts';
import { getRegisteredProviders } from './providers.ts';

for (const adapter of getRegisteredProviders()) {
    registerProviderSuite(adapter);
}
