---
name: code-frontmatter
description: 'Context-efficient codebase navigation using structured frontmatter. Before loading full files, read only the first 15-20 lines to parse frontmatter metadata describing purpose, inputs, outputs, and usage. This dramatically reduces token usage when exploring unfamiliar codebases.'
---

# Code Frontmatter Indexing

## Overview

When exploring a codebase, avoid loading entire files just to understand what they do. Instead, read only the frontmatter block at the top of each file first, then selectively load full files only when relevant to the task.

## Core Principle

**Never load a full file without first checking its frontmatter.**

Use `view` with a line range like `[1, 20]` to read just the header. Parse the frontmatter to understand:

- What the file does
- What inputs it expects
- What outputs it produces
- How to use it
- What it depends on

Only load the full file if the frontmatter indicates it's relevant to the current task.

## Frontmatter Format

Files should contain a YAML frontmatter block in a comment at the very top. The format varies by language but follows a consistent schema.

### Python

```python
"""
---
purpose: Brief description of what this file/module does
inputs:
  - name: type - description
  - name: type - description
outputs:
  - name: type - description
dependencies:
  - module_name
  - ./relative/path.py
exports:
  - function_name
  - ClassName
usage: |
  from module import function
  result = function(arg1, arg2)
related:
  - ./other_file.py - why it's related
modified: YYYY-MM-DD - what changed
---
"""
```

### JavaScript/TypeScript

```javascript
/**
 * ---
 * purpose: Brief description
 * inputs:
 *   - name: type - description
 * outputs:
 *   - name: type - description
 * dependencies:
 *   - package-name
 *   - ./relative/path
 * exports:
 *   - functionName
 *   - ClassName
 * usage: |
 *   import { func } from './module'
 *   const result = func(arg)
 * related:
 *   - ./other.ts - relationship
 * modified: YYYY-MM-DD - what changed
 * ---
 */
```

### Go

```go
/*
---
purpose: Brief description
inputs:
  - name: type - description
outputs:
  - name: type - description
dependencies:
  - package/path
exports:
  - FunctionName
  - TypeName
usage: |
  result := package.Function(arg)
related:
  - ./other.go - relationship
modified: YYYY-MM-DD - what changed
---
*/
```

### Rust

```rust
//! ---
//! purpose: Brief description
//! inputs:
//!   - name: type - description
//! outputs:
//!   - name: type - description
//! dependencies:
//!   - crate_name
//! exports:
//!   - function_name
//!   - StructName
//! usage: |
//!   use crate::module::function;
//!   let result = function(arg);
//! related:
//!   - ./other.rs - relationship
//! modified: YYYY-MM-DD - what changed
//! ---
```

## Workflow

### 1. Directory Scan

When asked to work on a codebase, first list the directory structure:

```
view /path/to/project
```

### 2. Frontmatter Scan

For each relevant file, read only the frontmatter:

```
view /path/to/file.py [1, 20]
```

### 3. Build Mental Index

From the frontmatter, build an understanding of:

- Which files handle which responsibilities
- The dependency graph between files
- Entry points and exports

### 4. Selective Deep Loading

Only load full files when:

- The frontmatter indicates relevance to the task
- You need to modify the file
- You need to understand implementation details

### 5. Cross-Reference

Use the `related` field in frontmatter to discover connected files without loading them all.

## Schema Reference

### Core Fields (Recommended)

| Field     | Required | Description                                |
| --------- | -------- | ------------------------------------------ |
| `purpose` | Yes      | One-line description of what the file does |
| `related` | Yes\*    | Related files and why they're connected    |
| `inputs`  | No       | Key input parameters/data                  |
| `outputs` | No       | Main outputs/return values                 |

\*`related` is strongly recommended for navigation - it's the most valuable field for codebase exploration.

### Extended Fields (Optional - use sparingly)

| Field          | Description                                 |
| -------------- | ------------------------------------------- |
| `note`         | Important context (e.g., naming history)    |
| `dependencies` | External packages (rarely needed)           |
| `exports`      | Public API (use TypeScript exports instead) |
| `usage`        | Code example (use JSDoc @example instead)   |
| `modified`     | Last change (use git history instead)       |

### Practical Guidance

**Keep it minimal.** The goal is quick scanning, not comprehensive documentation.

Good frontmatter (~50 tokens):

```typescript
/**
 * ---
 * purpose: Main players API - fetches all FPL player data with stats
 * outputs:
 *   - NormalizedPlayersResponse - Players grouped by position
 * related:
 *   - app/api/players/search/route.ts - Paginated version
 *   - @/pipeline/supabase/client - Database access
 * ---
 */
```

**Skip frontmatter for:**

- Small utility files (<30 lines)
- Test files
- Index/barrel files (unless they have complex re-exports)
- Config files (vitest.config.ts, etc.)

## Benefits

1. **Token Efficiency**: A 300-line file's frontmatter uses ~50 tokens vs ~1500 for the full file
2. **Faster Navigation**: Quickly understand a codebase without reading every line
3. **Better Decisions**: Know which files to load before committing context window space
4. **Documentation**: Frontmatter doubles as inline documentation for human developers

## Example Session

```
User: Help me add caching to the data fetcher

Claude: Let me scan the codebase frontmatter first.

[views directory structure]
[reads lines 1-20 of each .py file]

From the frontmatter I can see:
- src/fetcher.py: "Fetches data from external APIs" - this is the target
- src/cache.py: "Redis-based caching layer" - this exists already
- src/config.py: "Configuration management" - may need cache settings

Let me load the full fetcher.py and cache.py to implement this...
```

## Notes

- If a file lacks frontmatter, note this and load it fully if it seems relevant
- Frontmatter should be updated when files change significantly
- The `modified` field helps track staleness
- Keep frontmatter concise - it's an index, not full documentation
