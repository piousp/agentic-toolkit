# Skills

Layout rules for this directory.

## Structure

Every skill is a directory holding a `SKILL.md`:

```text
skills/<category>/<name>/
  SKILL.md
  scripts/        optional: commands the skill runs
  references/     optional: material the skill reads
  assets/         optional: templates and fixtures
```

The `name` in the frontmatter equals the directory name. Harnesses match on `name`, not on the path, so the category never appears in a skill's identity.

## Categories

A category is a navigation axis, created when its first skill arrives. A skill belongs to exactly one category. Do not create a category with no skills in it.

## Frontmatter

Required: `name`, `description`. The description must say what the skill does and when it applies, because it is the only text a harness shows the model before deciding to load the skill.

Optional Harness fields (`license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation`) follow the Agent Skills specification and are documented in the skill itself when used.

## Writing rules

- Instructions, in the imperative, addressed to the agent that loads the skill.
- Every path inside a skill is relative to the skill directory.
- Cross-references to other skills use one of two forms: `skill:<name>`, or a relative link ending in `SKILL.md`. The repository check fails when the target does not exist. References to agents in prose are not checked yet.
- No project-specific, employer-specific or machine-specific details.

## Index

<!-- GENERATED:BEGIN -->
<!-- GENERATED:END -->
