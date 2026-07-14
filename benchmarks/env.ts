import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// Load the repo-root .env regardless of the working directory, and quietly:
// dotenv@17 logs to stdout by default, which would corrupt --json output.
loadEnv({
    path: fileURLToPath(new URL('../.env', import.meta.url)),
    quiet: true,
});
