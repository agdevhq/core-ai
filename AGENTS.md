# Repository Conventions

## Workspace

Turborepo monorepo managed with npm workspaces.

- Apps: `apps/*`
- Packages: `packages/*`,

When adding a dependency to a workspace package, use the `-w` flag to specify which workspace receives it:

```
npm install -w <workspace-name> some-package
```

## TypeScript & ESM

All packages use ESM (`"type": "module"`) with `allowImportingTsExtensions` enabled. All relative imports must use `.ts` extensions.

TypeScript configurations:
- **Base** (`base.json`): `module: "NodeNext"`, `moduleDetection: "force"`, target ES2022, strict mode
- **Node.js services** (`node.json`): base NodeNext with build output settings

## Build & Deployment

Turborepo tasks: `build`, `dev`, `lint`, `package`, `publish`.

Deployment configurations in `deploy/` (Docker Compose).

## Contributing

Before contributing changes, first read the `contributing` skill.

## Code Style

### General Conventions

- **Named exports** over default exports (default exports OK for single-purpose modules)
- **Function naming**: `create*` (factory), `get*` (retrieval), `handle*` (events)
- **Pure functions** preferred — avoid side effects where possible

### Functional Programming Approach

Always use functions instead of classes unless absolutely necessary.

```typescript
// Preferred
export function createRouter<TRoutes extends RouteMap>(
    config: RouterConfig,
    routes: TRoutes
): Router<TRoutes> {
    return {
        config,
        ...routes,
    };
}

// Avoid
export class RouterManager {
    createRouter() { /* ... */ }
}
```

Classes are only acceptable for:
- Custom Error types with inheritance
- External library integration requiring class-based patterns

### Type Definitions

**No `any` types** — use generics, unions, or `unknown`:

```typescript
export function cloneItem<T>(item: T): T {
    return structuredClone(item);
}

export function formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}
```

**`type` over `interface`** — use `interface` only for declaration merging, extension, or public APIs that may need extension:

```typescript
// Default — type
export type RetryOptions = {
    maxAttempts: number;
    delayMs: number;
    backoff: 'linear' | 'exponential';
};

// Acceptable — interface when extending
export interface CacheProvider<TValue> extends StorageProvider {
    get: (key: string) => Promise<TValue | null>;
}
```

### Generics

Use generics extensively for type safety and reusability:

```typescript
export function createHandler<
    TInput extends Record<string, unknown>,
    TOutput extends ResponseShape<TInput>,
>(
    schema: Schema<TInput>,
    handler: HandlerFn<TInput, TOutput>
): RequestHandler<TInput, TOutput> {
    return { schema, handle: handler };
}
```

Strict type checking: `noUncheckedIndexedAccess: true`, `strict: true`. Avoid type assertions (`as`) unless absolutely necessary.

### Error Handling

Custom errors extend `Error` with meaningful messages:

```typescript
export class NotFoundError extends Error {
    constructor(resource: string, id: string) {
        super(`${resource} ${id} not found`);
        this.name = 'NotFoundError';
    }
}
```

### Database Access

Functional approach — use functions, not classes:

```typescript
export function createConnection(url: string): DatabaseClient {
    return new DatabaseClient({ url });
}

export async function findUserById(
    db: DatabaseClient,
    id: string
): Promise<User | null> {
    return (
        (await db
            .selectFrom('users')
            .where('id', '=', id)
            .selectAll()
            .executeTakeFirst()) || null
    );
}
```

### Constants and Configuration

Use `const` assertions for readonly config objects:

```typescript
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_CONFIG = {
    retries: 3,
    timeout: 5000,
    verbose: false,
} as const;
```

### Import Organization

- Local file imports: always include `.ts` extensions
- Workspace package imports and npm packages: no extensions needed
- Check the target package's `package.json` exports before importing from workspace packages

Group imports in this order:

1. External packages (npm libraries)
2. Internal workspace packages
3. Relative imports (local modules, utilities)

```typescript
import { z } from 'zod';
import { getLogger } from '@workspace/logging';

import { createConnection } from '../database.ts';
import { UserRole } from '../models/user.ts';
```
