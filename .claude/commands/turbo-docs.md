# Turbo Docs - Search Turborepo Documentation

Look up Turborepo documentation directly from the terminal using `turbo docs`.

## Usage

When you need to understand a Turborepo concept, configuration option, or best practice:

```bash
turbo docs "$ARGUMENTS"
```

If no arguments are provided, search for general Turborepo best practices.

## Common Searches

```bash
# Task configuration
turbo docs "task dependencies"
turbo docs "inputs and outputs"
turbo docs "environment variables in tasks"

# Caching
turbo docs "remote caching"
turbo docs "cache troubleshooting"
turbo docs "cache miss debugging"

# CI/CD
turbo docs "github actions"
turbo docs "affected flag"
turbo docs "dry run"

# Architecture
turbo docs "workspace configuration"
turbo docs "package graph"
turbo docs "boundaries"
```

## Machine-Readable Docs

For programmatic access, append `.md` to any Turborepo docs URL:
- `https://turborepo.dev/docs/reference/configuration.md`
- `https://turborepo.dev/docs/reference/run.md`
- Full sitemap: `https://turborepo.dev/sitemap.md`

## When to Use

- Before configuring a new turbo.json task
- When debugging cache misses or unexpected task behavior
- When optimizing CI pipeline performance
- When setting up remote caching or worktrees
- Anytime you need authoritative Turborepo guidance

After searching, summarize the key findings and apply them to the Jovie monorepo context.
