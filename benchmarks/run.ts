// Must be first: loads the root .env before providers.ts reads env vars.
import './env.ts';
import { parseArgs } from 'node:util';
// Hoisted dependency of @core-ai/openai; imported directly in this dev-only
// script to disable client retries, which would otherwise distort timings.
import OpenAI from 'openai';

import type { ReasoningEffort } from '@core-ai/core-ai';
import { createOpenAICompatChatProvider } from '@core-ai/openai/compat';

import {
    measureRun,
    summarize,
    type RunMetrics,
    type RunOutcome,
    type Summary,
} from './bench.ts';
import {
    apiKeyEnvName,
    providers,
    resolveApiKey,
    type ProviderSpec,
} from './providers.ts';

const DEFAULT_PROMPT =
    'Write a vivid 300-word short story about a lighthouse keeper who ' +
    'discovers a message in a bottle on a stormy night.';

const HELP = `Benchmark core-ai providers and OpenAI-compatible endpoints (TTFT, tokens/sec).

Usage: npx tsx benchmarks/run.ts [options]

Options:
  --runs <n>        measured runs per provider (default 5)
  --warmup <n>      discarded warmup runs (default 1)
  --prompt <text>   prompt to send (default: fixed story prompt)
  --max-tokens <n>  maxTokens per run (default 8192; reasoning models spend
                    part of the budget thinking before any visible output)
  --timeout <ms>    per-run timeout (default 120000)
  --reasoning-effort <e>  minimal|low|medium|high|max; overrides the per-
                    provider setting. Only send to models that support it.
  --provider <names> filter registry by name; comma-separated and/or repeatable
  --base-url <url>  ad-hoc provider base URL (requires --model)
  --model <ids>     model(s) for the ad-hoc provider, or override for
                    --provider; comma-separated for multiple
  --name <name>     ad-hoc provider name, drives <NAME>_API_KEY (default adhoc)
  --json            emit JSON to stdout instead of a table
  --help            show this help

API keys are read from <NAME>_API_KEY env vars (root .env is loaded).
Registered providers: ${providers.map((p) => p.name).join(', ')}`;

type BenchConfig = {
    runs: number;
    warmup: number;
    prompt: string;
    maxTokens: number;
    timeoutMs: number;
    reasoningEffort: ReasoningEffort | undefined;
    json: boolean;
};

const REASONING_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];

function parseReasoningEffort(
    value: string | undefined
): ReasoningEffort | undefined {
    if (value === undefined) {
        return undefined;
    }
    const effort = REASONING_EFFORTS.find((e) => e === value);
    if (!effort) {
        throw new Error(
            `Invalid value for --reasoning-effort: ${value}. ` +
                `Valid: ${REASONING_EFFORTS.join(', ')}`
        );
    }
    return effort;
}

type ProviderResult = {
    spec: ProviderSpec;
    runs: RunOutcome[];
    /** Set when the provider never produced a measured run (e.g. warmup failed). */
    failure?: string;
};

function parseIntArg(value: string, flag: string, min: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
        throw new Error(
            `Invalid value for ${flag}: ${value} (expected integer >= ${min})`
        );
    }
    return parsed;
}

function selectProviders(values: {
    provider?: string[];
    'base-url'?: string;
    model?: string;
    name?: string;
}): ProviderSpec[] {
    const selected: ProviderSpec[] = [];

    const providerNames = (values.provider ?? [])
        .flatMap((value) => value.split(','))
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

    if (providerNames.length > 0) {
        for (const name of providerNames) {
            const spec = providers.find((p) => p.name === name);
            if (!spec) {
                throw new Error(
                    `Unknown provider '${name}'. Registered: ${providers
                        .map((p) => p.name)
                        .join(', ')}`
                );
            }
            // A --model override also clears the spec's reasoningEffort:
            // it was tuned for the registry model (use --reasoning-effort
            // to set one explicitly).
            selected.push(
                values.model !== undefined
                    ? {
                          ...spec,
                          model: values.model,
                          reasoningEffort: undefined,
                      }
                    : spec
            );
        }
    }

    if (values['base-url'] !== undefined) {
        if (values.model === undefined) {
            throw new Error('--base-url requires --model');
        }
        selected.push({
            name: values.name ?? 'adhoc',
            baseUrl: values['base-url'],
            model: values.model,
        });
    }

    // No filter and no ad-hoc spec: run the full registry.
    return selected.length > 0 ? selected : [...providers];
}

/** Expands comma-separated `model` values into one bench target per model. */
function expandModels(specs: ProviderSpec[]): ProviderSpec[] {
    return specs.flatMap((spec) =>
        spec.model
            .split(',')
            .map((model) => model.trim())
            .filter((model) => model.length > 0)
            .map((model) => ({ ...spec, model }))
    );
}

async function benchProvider(
    spec: ProviderSpec,
    config: BenchConfig
): Promise<ProviderResult> {
    const client = new OpenAI({
        apiKey: resolveApiKey(spec),
        baseURL: spec.baseUrl,
        maxRetries: 0,
    });
    const model = createOpenAICompatChatProvider(
        { client },
        spec.name
    ).chatModel(spec.model);

    const runArgs = {
        model,
        prompt: config.prompt,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
        reasoningEffort: config.reasoningEffort ?? spec.reasoningEffort,
    };

    const label = `${spec.name} · ${spec.model}`;

    for (let i = 0; i < config.warmup; i++) {
        progress(dimErr(`○ ${label} — warmup ${i + 1}/${config.warmup}`));
        const outcome = await measureRun(runArgs);
        if (!outcome.ok) {
            progressDone(redErr(`✗ ${label} — warmup failed`));
            return { spec, runs: [], failure: outcome.error };
        }
    }

    const runs: RunOutcome[] = [];
    let lastNote = '';
    for (let i = 0; i < config.runs; i++) {
        progress(
            dimErr(`○ ${label} — run ${i + 1}/${config.runs}${lastNote}`)
        );
        const outcome = await measureRun(runArgs);
        runs.push(outcome);
        lastNote = outcome.ok
            ? ` · ttft ${fmtMs(outcome.metrics.ttftMs)} · ${Math.round(
                  outcome.metrics.genTokensPerSec ??
                      outcome.metrics.e2eTokensPerSec
              )} tok/s`
            : ' · failed';
    }

    const okCount = runs.filter((run) => run.ok).length;
    const paint = statusPaint(okCount, config.runs, {
        red: redErr,
        yellow: yellowErr,
        green: greenErr,
    });
    const mark = okCount === 0 ? '✗' : '✓';
    progressDone(paint(`${mark} ${label} — ${okCount}/${config.runs} ok`));

    return { spec, runs };
}

function okMetrics(result: ProviderResult): RunMetrics[] {
    return result.runs
        .filter((run): run is { ok: true; metrics: RunMetrics } => run.ok)
        .map((run) => run.metrics);
}

function fmtMs(ms: number): string {
    return ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtRate(perSec: number, estimated: boolean): string {
    return `${estimated ? '~' : ''}${Math.round(perSec)}/s`;
}

// ANSI styling, applied only on a TTY so redirected/copied output stays
// plain text. Cells are padded before painting so codes never skew widths.
const paintWith =
    (code: string, enabled: boolean) =>
    (text: string): string =>
        enabled ? `[${code}m${text}[0m` : text;

const useColor = process.stdout.isTTY === true;
const dim = paintWith('2', useColor);
const bold = paintWith('1', useColor);
const green = paintWith('32', useColor);
const yellow = paintWith('33', useColor);
const red = paintWith('31', useColor);

// Progress goes to stderr, which can be a TTY even when stdout is piped.
const stderrTTY = process.stderr.isTTY === true;
const dimErr = paintWith('2', stderrTTY);
const greenErr = paintWith('32', stderrTTY);
const yellowErr = paintWith('33', stderrTTY);
const redErr = paintWith('31', stderrTTY);

/** Rewrites the current stderr line on a TTY; silent otherwise. */
function progress(text: string): void {
    if (stderrTTY) {
        process.stderr.write(`\r[2K${text}`);
    }
}

/** Finalizes the provider's progress as one persistent line. */
function progressDone(text: string): void {
    process.stderr.write(`${stderrTTY ? `\r[2K` : ''}${text}\n`);
}

type Cell = {
    text: string;
    paint?: (text: string) => string;
};

function cell(text: string, paint?: (text: string) => string): Cell {
    return { text, paint };
}

type Paint = (text: string) => string;

/** Status color shared by the table and the live progress line. */
function statusPaint(
    okRuns: number,
    totalRuns: number,
    palette: { red: Paint; yellow: Paint; green: Paint }
): Paint {
    if (okRuns === 0) {
        return palette.red;
    }
    return okRuns === totalRuns ? palette.green : palette.yellow;
}

function formatTable(results: ProviderResult[], config: BenchConfig): string {
    const anyReasoning = results.some((result) =>
        okMetrics(result).some((m) => (m.reasoningTokens ?? 0) > 0)
    );

    const header = [
        'provider',
        'model',
        'ttft med',
        'p95',
        'tok/s',
        'e2e tok/s',
        'total',
        'out tok',
        ...(anyReasoning ? ['reasoning'] : []),
        'ok',
    ].map((text) => cell(text, dim));

    // provider and model are left-aligned; every metric column is
    // right-aligned so digits line up.
    const leftAligned = new Set([0, 1]);

    const rows: Cell[][] = results.map((result) => {
        const metrics = okMetrics(result);
        const okText = `${metrics.length}/${result.runs.length}`;
        const okCell = cell(
            okText,
            statusPaint(metrics.length, result.runs.length, {
                red,
                yellow,
                green,
            })
        );

        if (metrics.length === 0) {
            return [
                cell(result.spec.name, bold),
                cell(result.spec.model),
                cell('FAILED', red),
                // Empty filler cells between FAILED and the ok column.
                ...Array.from({ length: header.length - 4 }, () => cell('')),
                okCell,
            ];
        }

        const ttft = summarize(metrics.map((m) => m.ttftMs));
        const genRates = metrics
            .map((m) => m.genTokensPerSec)
            .filter((rate): rate is number => rate !== undefined);
        const genEstimated = metrics.some((m) => m.genRateEstimated);
        const e2eRate = summarize(metrics.map((m) => m.e2eTokensPerSec));
        const total = summarize(metrics.map((m) => m.totalMs));
        const outTokens = summarize(metrics.map((m) => m.outputTokens));
        const estimated = metrics.some((m) => m.tokensEstimated);

        const reasoningCell = (): Cell => {
            const share =
                summarize(
                    metrics.map(
                        (m) => (m.reasoningTokens ?? 0) / m.outputTokens
                    )
                ).median * 100;
            return cell(`${Math.round(share)}%`);
        };

        return [
            cell(result.spec.name, bold),
            cell(result.spec.model),
            cell(fmtMs(ttft.median)),
            cell(fmtMs(ttft.p95)),
            cell(
                genRates.length > 0
                    ? fmtRate(summarize(genRates).median, genEstimated)
                    : '—',
                bold
            ),
            cell(fmtRate(e2eRate.median, estimated)),
            cell(fmtMs(total.median)),
            cell(`${estimated ? '~' : ''}${Math.round(outTokens.median)}`),
            ...(anyReasoning ? [reasoningCell()] : []),
            okCell,
        ];
    });

    const widths = header.map(({ text }, column) =>
        Math.max(
            text.length,
            ...rows.map((row) => (row[column]?.text ?? '').length)
        )
    );
    const formatRow = (row: Cell[]): string =>
        row
            .map(({ text, paint }, column) => {
                const width = widths[column] ?? 0;
                const padded = leftAligned.has(column)
                    ? text.padEnd(width)
                    : text.padStart(width);
                return paint ? paint(padded) : padded;
            })
            .join('   ')
            .trimEnd();

    const totalWidth =
        widths.reduce((sum, width) => sum + width, 0) +
        (widths.length - 1) * 3;
    const summary = `${config.runs} runs · ${config.warmup} warmup · max ${config.maxTokens} tokens`;

    const failureNotes = results
        .filter((result) => okMetrics(result).length === 0)
        .map((result) => {
            const reason =
                result.failure ??
                result.runs.find(
                    (run): run is { ok: false; error: string } => !run.ok
                )?.error ??
                'unknown';
            return red(`✗ ${result.spec.name} (${result.spec.model}): `) +
                reason;
        });

    return [
        dim(summary),
        '',
        formatRow(header),
        dim('─'.repeat(totalWidth)),
        ...rows.map(formatRow),
        ...(failureNotes.length > 0 ? ['', ...failureNotes] : []),
    ].join('\n');
}

function toJsonResult(
    result: ProviderResult,
    config: BenchConfig
): Record<string, unknown> {
    const metrics = okMetrics(result);
    const summaryOf = (
        pick: (metrics: RunMetrics) => number | undefined
    ): Summary | undefined => {
        const values = metrics
            .map(pick)
            .filter((value): value is number => value !== undefined);
        return values.length > 0 ? summarize(values) : undefined;
    };

    return {
        name: result.spec.name,
        model: result.spec.model,
        baseUrl: result.spec.baseUrl,
        config: {
            runs: config.runs,
            warmup: config.warmup,
            maxTokens: config.maxTokens,
            timeoutMs: config.timeoutMs,
            reasoningEffort:
                config.reasoningEffort ?? result.spec.reasoningEffort,
            prompt: config.prompt,
        },
        failure: result.failure,
        runs: result.runs,
        summary: {
            ttftMs: summaryOf((m) => m.ttftMs),
            genTokensPerSec: summaryOf((m) => m.genTokensPerSec),
            e2eTokensPerSec: summaryOf((m) => m.e2eTokensPerSec),
            totalMs: summaryOf((m) => m.totalMs),
            outputTokens: summaryOf((m) => m.outputTokens),
        },
    };
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            runs: { type: 'string', default: '5' },
            warmup: { type: 'string', default: '1' },
            prompt: { type: 'string', default: DEFAULT_PROMPT },
            'max-tokens': { type: 'string', default: '8192' },
            timeout: { type: 'string', default: '120000' },
            'reasoning-effort': { type: 'string' },
            provider: { type: 'string', multiple: true },
            'base-url': { type: 'string' },
            model: { type: 'string' },
            name: { type: 'string' },
            json: { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });

    if (values.help) {
        console.log(HELP);
        return;
    }

    const config: BenchConfig = {
        runs: parseIntArg(values.runs, '--runs', 1),
        warmup: parseIntArg(values.warmup, '--warmup', 0),
        prompt: values.prompt,
        maxTokens: parseIntArg(values['max-tokens'], '--max-tokens', 1),
        timeoutMs: parseIntArg(values.timeout, '--timeout', 1),
        reasoningEffort: parseReasoningEffort(values['reasoning-effort']),
        json: values.json,
    };

    const selected = selectProviders(values);

    const missing = selected.flatMap((spec) => {
        const missingVars = [
            ...(resolveApiKey(spec) ? [] : [apiKeyEnvName(spec)]),
            ...(spec.baseUrl === '' ? [spec.baseUrlEnv ?? 'base URL'] : []),
        ];
        return missingVars.length > 0
            ? [`${spec.name} (${missingVars.join(', ')})`]
            : [];
    });
    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    const targets = expandModels(selected);

    const results: ProviderResult[] = [];
    // Strictly sequential so providers are not distorted by self-inflicted
    // rate limiting or local bandwidth contention.
    for (const spec of targets) {
        results.push(await benchProvider(spec, config));
    }

    if (config.json) {
        console.log(
            JSON.stringify(
                results.map((result) => toJsonResult(result, config)),
                null,
                2
            )
        );
    } else {
        console.log(`\n${formatTable(results, config)}`);
    }
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
