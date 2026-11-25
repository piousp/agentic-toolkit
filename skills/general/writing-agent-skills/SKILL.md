---
name: writing-agent-skills
description: >
  Use when authoring, reviewing or refurbishing an agent Skill: writing SKILL.md
  frontmatter and body, structuring the scripts/references/assets folders,
  tightening a trigger description, shrinking a skill that grew too long, or
  deciding whether to keep, fix or retire a skill. [DO NOT] trigger for general
  coding, prose writing, non-skill documentation or a skill's own test suite.
---

# Writing Agent Skills

One rule overrides the rest when writing a skill:

- [NEVER] write meta references, self-thoughts, or anything in the body that is not an instruction.
- [ALWAYS] keep it simple: simplicity is the goal, not a side effect.
- [ALWAYS] write short directives an agent can follow without rereading them.

## 1. Structure

A skill is a folder: `SKILL.md` (required) plus optional `scripts/`, `references/`, `assets/`.

- Always loaded: `name` and `description` in the frontmatter.
- Loaded on trigger: the `SKILL.md` body.
- Loaded on demand: files under `scripts/`, `references/`, `assets/`.
- [ALWAYS] reference those files by relative path ("read `references/first.md`").

This skill covers writing and structure only. A skill's own test suite is a separate concern with its own method.

## 2. Description

The `description` is the trigger. State what the skill does and when to use it, then the negative case: when [DO NOT] trigger.

- {BAD} "Helps with documents" / "API helper"
- {GOOD} "Create, edit and analyze .docx files; tracks changes, comments, formatting, text extraction. Triggers whenever the user works with docx files. [DO NOT] trigger for any other file type."

If a skill is only ever invoked by name and never auto-triggers, say so in the body. The description then only needs to be accurate.

## 3. Writing

- Lead with a short example over a long explanation.
- Give a reason in one line. One is often what stops a rule from reading as optional; a paragraph of it buries the rule.
- State each rule once, where the agent needs it. A restatement costs the tokens of the rule and adds nothing.
- Keep the qualifiers: a condition, a hedge that states real uncertainty, a number, a path, a flag. A sentence that would survive without them is shorter once they are gone, and wrong.
- [NEVER] pad with "essentially", "basically", "very", "simply".
- Write impersonally, third person neutral. The reader is an agent, not a person to motivate.
- Highlight a keyword with `**` and/or `[]` to raise the weight of the instruction.
  - Enforcement: [ALWAYS], [MUST], [DO], [FOLLOW].
  - Negative: [NEVER], [DO NOT].
  - Combining `**` and `[]` asks harder; other verbs are allowed.
- Vary sentence length and structure; a uniform rhythm reads as generated text.
- [NEVER] use AI-tell vocabulary: delve, tapestry, realm, landscape, journey, nuanced, multifaceted, transformative, pivotal, robust, seamless, invaluable, moreover, additionally, notably, crucially, "not only... but also", "in conclusion", "in summary", "paving the way", "shed light on".
- [NEVER] use em-dashes or hyphens as a pause; connect ideas with periods, commas or semicolons.
- [NEVER] close with a formula phrase or comment on the text itself ("as a language model", "I hope this helps").

## 4. Length

Every line costs tokens, shapes behavior, and has to be maintained.

- Body of `SKILL.md` under ~500 lines.
- Split multi-topic skills into `references/*.md` files the agent loads only when needed.
- If a reference file exceeds 500 lines, put a table of contents with line hints at the top.
- If the skill is multi-staged, put each stage in its own file under `stages/` (a convention some skills use, not part of the layout) and reference them from `SKILL.md` by relative path.

Shrinking a skill that grew too long is the same job in reverse: same rules, fewer words. Summarizing is a different job, and it loses rules.

- [MUST] list every rule of the original first, one line each, before cutting anything.
- [NEVER] shorten by dropping a part: a trigger, a [DO NOT] case, a directive ([ALWAYS], [MUST], [DO]) or its exception, a condition ("only if", "unless", "when", "except"), a step whose order matters, a literal command, path, flag, name, number, unit or threshold, an output field, a cross-reference to another skill or file, an example that disambiguates, a reason without which a rule reads as optional.
- [NEVER] hit a length target by losing a rule. When the target cannot be met without one, say so and ask.
- Cut what carries no rule: restatement, throat-clearing, padding, self-reference, motivational text, an example that repeats a rule already clear.
- Content another skill already holds is referenced, not copied: `skill:<name>`, or a relative link to its `SKILL.md`.
- Moving a block to `references/` keeps it: the words leave the body, the rule does not. Leave the relative path where the block was.
- [MUST] map every rule of the original to its line in the result before delivering. A rule with no match goes back. A rule that came out weaker (a [NEVER] turned into advice, a condition dropped, a number rounded) goes back to its original wording.
- Show the diff and the coverage before applying a cut to an existing skill. [NEVER] apply a cut silently.
- [NEVER] touch the frontmatter `description` while shrinking unless asked; when asked, show the old and the new text.
- [NEVER] re-cut your own output: the second pass removes what the first one kept on purpose.

## 5. Level of freedom

Describe the goal, not a rigid step sequence, unless order genuinely matters:

- {BAD} "Step 1: read the file. Step 2: parse JSON. Step 3: update the port. Step 4: write it back."
- {GOOD} "Update the database port in the config file to the value the user specifies."

Prefer constraints over procedures: "Always run tests before opening a PR. Never push to main", not a scripted checklist of git commands.

When step order is fragile, that is not a skill problem: write a script in `scripts/` and have the skill call it.

## 6. Naming

- Propose three names and [MUST] state a recommendation; [NEVER] pick one without the user's choice.
- `name` in the frontmatter [MUST] equal the directory name (`my-test-skill/SKILL.md` has `name: my-test-skill`).
- Kebab-case: lowercase letters and hyphens.

## 7. Keeping versus retiring

Retire a skill when its `description` no longer fits the routing window, or when another skill or the base model covers its capability. Retirement deletes the directory and cleans the references other skills make to it. [NEVER] leave a stub folder behind.

## Source

Distilled from Philipp Schmid, "8 Tips for Writing Agent Skills", https://www.philschmid.de/agent-skills-tips. The original carries the full prose and examples.
