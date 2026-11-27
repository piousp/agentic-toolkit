import path from "node:path";

import { z } from "zod";

import type { LineRange } from "./linediff.ts";
import type { ComplexityUnit, MaxComplexity } from "./metrics.ts";
import type { SkippedFile } from "./scope.ts";

// D1: snake_case from the wire to the JSON, one spelling everywhere, so the schema,
// the TypeScript type and the printed answer are the same strings.
export const MEASURE_VERB = "measure";
export const MEASURE_LANGUAGE = "typescript";

// The metric vocabulary both verbs report. The plan fixes the field and leaves the
// literal to the package, so this names the version of that vocabulary.
export const MEASURE_METRICSET = "v1";
export const MEASURE_METRICS = [
  "loc",
  "functions",
  "max_complexity",
  "importers",
  "sha256",
] as const;

export type MeasureMetric = (typeof MEASURE_METRICS)[number];

// R1/D3: the scope is a discriminated union, one mode and no overlapping field.
export type SymbolSelector = {
  readonly kind: "function" | "class";
  readonly path: string;
  readonly symbol: string;
};

export type ModuleSelector = { readonly kind: "module"; readonly path: string };
export type RepositorySelector = { readonly kind: "repository" };

export type AreaSelector = SymbolSelector | ModuleSelector | RepositorySelector;

export type DiffScopeRequest = {
  readonly mode: "diff";
  readonly base: string;
  readonly paths?: readonly string[];
};

export type AreaScopeRequest = { readonly mode: "area"; readonly area: AreaSelector };

export type MeasureRequest = {
  readonly scope: DiffScopeRequest | AreaScopeRequest;
  readonly select?: readonly MeasureMetric[];
};

// R4: every reported number travels with the argv that reproduces it.
export type MeasureEvidenceEntry = { readonly command: string };

// R4/D8: an evidence command is a line a caller pastes into a shell, so a token that
// carries a blank or a quote travels quoted and every other token keeps the spelling
// it had. Both verbs spell their evidence this way, so one helper spells it.
const BARE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./#-]+$/;

function quoteArgument(argument: string): string {
  if (BARE_ARGUMENT.test(argument)) {
    return argument;
  }
  return `'${argument.replaceAll("'", "'\\''")}'`;
}

export function commandLine(tokens: readonly string[]): string {
  return tokens.map(quoteArgument).join(" ");
}

// R3/D5: an evidence command is pasted in the tree it measured, so the build cannot be
// named by the bare `dist/cli.js` that exists at the package root only. The entry token
// is the path from the measured root to the built file, whose directory is resolved the
// way `rulesetDir` resolves the rulesets: beside the sources and below dist alike. The
// quoting stays with `commandLine`, so both verbs spell their evidence the same way.
export function evidenceCommand(workspaceRoot: string, args: readonly string[]): string {
  const entry = path.resolve(import.meta.dirname, "..", "dist", "cli.js");
  return commandLine(["node", path.relative(workspaceRoot, entry), ...args]);
}

// `select` narrows what the answer reports, so a metric the request did not ask
// for is absent instead of zero: a zero that was never measured is a number the
// caller would trust. The metric keys are optional for that reason, and the
// evidence carries exactly the metrics that travelled.
export type MeasureEvidence = Readonly<Partial<Record<MeasureMetric, MeasureEvidenceEntry>>>;

export type MeasureFileEntry = {
  readonly path: string;
  readonly sha256?: string;
  readonly loc?: number;
  readonly functions?: number;
  readonly max_complexity?: MaxComplexity;
  readonly importers?: number;
  // R3: the per-unit breakdown travels only in the function and class
  // granularities, where the selector named the units; module and repository omit
  // the key instead of reporting an empty list.
  readonly units?: readonly ComplexityUnit[];
  readonly evidence: MeasureEvidence;
};

export type MeasureScopeSummary = {
  readonly mode: "diff" | "area";
  readonly base: string | null;
  readonly base_commit: string | null;
  readonly area: AreaSelector | null;
  readonly files: readonly string[];
  readonly skipped: readonly SkippedFile[];
};

// D2: root is always the reported "."; the type stays a string because the value is
// a constant of the answer, not a literal type of the contract.
export type MeasureResponse = {
  readonly verb: typeof MEASURE_VERB;
  readonly metricset: string;
  readonly language: typeof MEASURE_LANGUAGE;
  readonly root: string;
  readonly scope: MeasureScopeSummary;
  readonly files: readonly MeasureFileEntry[];
};

const symbolSelectorSchema = z.strictObject({
  kind: z.enum(["function", "class"]),
  path: z.string().min(1),
  symbol: z.string().min(1),
});

const moduleSelectorSchema = z.strictObject({
  kind: z.literal("module"),
  path: z.string().min(1),
});

const repositorySelectorSchema = z.strictObject({ kind: z.literal("repository") });

export const areaSelectorSchema = z.discriminatedUnion("kind", [
  symbolSelectorSchema,
  moduleSelectorSchema,
  repositorySelectorSchema,
]);

// D3: the scope schema stays permissive on the one axis the resolvers own — which
// mode the request carries — so a scope naming both modes or neither reaches the
// resolver and comes back as SCOPE_DOUBLE or SCOPE_MISSING with its own code,
// instead of a PARAM_INVALID that would swallow the distinction. Every field here
// is one whose rejection code the resolver already produces, and a key it does not
// know is still refused.
export const measureScopeSchema = z.strictObject({
  mode: z.unknown().optional(),
  base: z.unknown().optional(),
  paths: z.array(z.string()).optional(),
  area: areaSelectorSchema.optional(),
});

export const measureRequestSchema = z.strictObject({
  scope: measureScopeSchema,
  select: z.array(z.enum([...MEASURE_METRICS])).optional(),
});

// R5: the recipe grammar the contract fixes for `preview`. It travels here with the
// service it describes: a published rule set, named by the prefix of its content
// digest, and the rules of that set the recipe selects.
const RECIPE_REFERENCE = /^[a-z0-9][a-z0-9-]*\.yaml#sha256:[0-9a-f]{12}$/;

export const previewRequestSchema = z.strictObject({
  recipe: z.strictObject({
    ruleset: z.string().regex(RECIPE_REFERENCE),
    rules: z.array(z.string()).optional(),
  }),
  paths: z.array(z.string()),
});

export const PREVIEW_VERB = "preview";

export type PreviewRecipe = {
  readonly ruleset: string;
  readonly rules?: readonly string[];
};

export type PreviewRequest = {
  readonly recipe: PreviewRecipe;
  readonly paths: readonly string[];
};

// The delta a preview reports is the difference an applied recipe would make, so a
// negative number is a metric the change reduces and a zero is a metric it leaves.
export type PreviewDelta = {
  readonly loc: number;
  readonly functions: number;
  readonly max_complexity: number;
  readonly importers: number;
};

export type PreviewEvidence = {
  readonly diff: MeasureEvidenceEntry;
  readonly delta: MeasureEvidenceEntry;
};

// R5: an origin the recipe edits is `modified`; a module the recipe would create is
// `created`, and its ranges and delta are read against the empty text it holds now.
export type PreviewFileEntry = {
  readonly path: string;
  readonly status: "modified" | "created";
  readonly ranges: readonly LineRange[];
  readonly diff: string;
  readonly delta: PreviewDelta;
  readonly evidence: PreviewEvidence;
};

export type PreviewRulesetSummary = {
  readonly name: string;
  readonly ruleset_digest: string;
  readonly rules: readonly string[];
};

export type PreviewDocumentEvidence = {
  readonly ruleset_digest: MeasureEvidenceEntry;
  readonly change_digest: MeasureEvidenceEntry;
};

// `applied` is the literal false: the service holds no code path that writes to the
// tree, and the answer says so in the type as well as in the value.
export type PreviewResponse = {
  readonly verb: typeof PREVIEW_VERB;
  readonly applied: false;
  readonly language: typeof MEASURE_LANGUAGE;
  readonly metricset: string;
  readonly ruleset: PreviewRulesetSummary;
  readonly change_digest: string;
  readonly paths: readonly string[];
  readonly files: readonly PreviewFileEntry[];
  readonly evidence: PreviewDocumentEvidence;
};
