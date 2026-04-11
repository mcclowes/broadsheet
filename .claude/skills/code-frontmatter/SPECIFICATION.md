# Code Frontmatter Specification

**Version**: 0.1.0  
**Status**: Draft

## Abstract

This specification defines a structured metadata format for source code files. The frontmatter block provides machine-readable context about a file's purpose, interface, and relationships without requiring the full file to be parsed.

## Motivation

AI coding assistants consume tokens proportional to the content they read. Loading a 300-line file to discover it implements "a genetic algorithm for team selection" wastes context window space that could be used for actual work.

By standardising a frontmatter format, tools can:

- Index codebases efficiently
- Make informed decisions about which files to load
- Understand file relationships without parsing imports
- Provide better navigation and documentation

## Specification

### Location

Frontmatter MUST appear at the very beginning of a file, within the first comment block.

### Delimiters

The frontmatter block MUST be delimited by `---` markers on their own lines within the comment.

### Format

The content between delimiters MUST be valid YAML.

### Required Fields

| Field     | Type   | Description                                                             |
| --------- | ------ | ----------------------------------------------------------------------- |
| `purpose` | string | A concise description of what the file does (max 120 chars recommended) |

### Optional Fields

| Field     | Type   | Description                                            |
| --------- | ------ | ------------------------------------------------------ | --- |
| `inputs`  | list   | Parameters, arguments, or data the file/module expects |
| `outputs` | list   | Return values, side effects, or data produced          |
| `usage`   | string | Brief code example (use YAML literal block `           | `)  |
| `related` | list   | Connected files with relationship description          |
| `tags`    | list   | Categorical labels for filtering                       |
| `status`  | string | `stable`, `experimental`, `deprecated`                 |

### Input/Output Format

Each input or output entry SHOULD follow the pattern:

```
- name: type - description
```

Example:

```yaml
inputs:
  - players: list[Player] - available player pool
  - budget: float - maximum spend allowed
outputs:
  - team: list[Player] - optimal 15-player squad
  - score: float - predicted points
```

### Dependency Format

Dependencies SHOULD use:

- Package names for external dependencies
- Relative paths (starting with `./` or `../`) for internal files

Example:

```yaml
dependencies:
  - numpy
  - pandas
  - ./utils/scoring.py
  - ../config.py
```

### Related Files Format

Each related entry SHOULD include the path and relationship:

```yaml
related:
  - ./cache.py - provides caching layer used by this fetcher
  - ./models.py - defines data structures returned
```

## Language-Specific Syntax

### Python

```python
"""
---
purpose: Description here
---
"""
```

### JavaScript/TypeScript

```javascript
/**
 * ---
 * purpose: Description here
 * ---
 */
```

### Go

```go
/*
---
purpose: Description here
---
*/
```

### Rust

```rust
//! ---
//! purpose: Description here
//! ---
```

### Ruby

```ruby
# ---
# purpose: Description here
# ---
```

### Shell/Bash

```bash
# ---
# purpose: Description here
# ---
```

After the shebang if present:

```bash
#!/bin/bash
# ---
# purpose: Description here
# ---
```

## Parsing Rules

1. Read the first 30 lines of the file (configurable)
2. Identify the comment syntax for the file type
3. Locate `---` delimiters within comment blocks
4. Extract content between delimiters
5. Strip comment prefixes (e.g., `#`, `*`, `//!`)
6. Parse as YAML

## Example

```python
"""
---
purpose: Genetic algorithm for Fantasy Premier League team optimisation
inputs:
  - players: list[Player] - all available players with stats
  - budget: float - maximum team cost (default 100.0)
  - generations: int - GA iterations (default 1000)
outputs:
  - team: list[Player] - optimal 15-player squad
  - fitness: float - predicted total points
dependencies:
  - numpy
  - ./player.py
  - ./fitness.py
exports:
  - run_ga
  - GAConfig
usage: |
  from ga import run_ga
  team, score = run_ga(players, budget=100.0)
related:
  - ./fitness.py - fitness function implementation
  - ./selection.py - player selection strategies
modified: 2024-12-20 - Added injury probability weighting
tags:
  - optimisation
  - fpl
complexity: high
status: stable
---
"""

import numpy as np
from .player import Player
from .fitness import calculate_fitness

# ... rest of implementation
```

## Tooling Recommendations

### Indexer

A tool that scans a directory and produces a JSON index:

```json
{
  "files": [
    {
      "path": "src/ga.py",
      "purpose": "Genetic algorithm for FPL team optimisation",
      "exports": ["run_ga", "GAConfig"],
      "dependencies": ["numpy", "./player.py", "./fitness.py"]
    }
  ]
}
```

### Validator

A linter that checks frontmatter validity:

- YAML syntax
- Required fields present
- Field types correct
- Paths resolve

### Generator

A tool that creates skeleton frontmatter from existing code by analysing:

- Function signatures
- Import statements
- Docstrings

## Versioning

This specification follows Semantic Versioning. The version is indicated in the document header.

## License

This specification is released under CC0 1.0 Universal (Public Domain).
