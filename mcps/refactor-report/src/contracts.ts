import { z } from "zod";

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
  mode: z.unknown(),
  base: z.unknown().optional(),
  paths: z.array(z.string()).optional(),
  area: areaSelectorSchema.optional(),
});

export const measureRequestSchema = z.strictObject({
  scope: measureScopeSchema,
  select: z.array(z.enum([...MEASURE_METRICS])).optional(),
});
