# Remote presence activity cache validation

Branch: `perf/presence-activity-cache-validation`

Environment: Node.js 22.16.0, local filesystem. Both paths were measured in the same process and machine.

The benchmark reproduces the current `readActivity()` work: bounded synchronous file read, JSON parse, SHA-256 verification, and activity access. The cached path uses the already-published header `generation` + `digest` + `unavailable` tuple and performs the full read only when that version changes.

| Activity size per session | Sessions | Before per poll | Cached per poll | Saved per poll | Hot-path speedup |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 KB | 1 | 0.137 ms | 0.00085 ms | 0.136 ms | 162x |
| 100 KB | 5 | 0.646 ms | 0.0038 ms | 0.642 ms | 170x |
| 100 KB | 10 | 1.279 ms | 0.0073 ms | 1.272 ms | 176x |
| 1 MB | 1 | 1.645 ms | 0.031 ms | 1.614 ms | 53x |
| 1 MB | 5 | 8.560 ms | 0.169 ms | 8.391 ms | 51x |
| 1 MB | 10 | 17.094 ms | 0.342 ms | 16.752 ms | 50x |
| 5 MB | 1 | 8.210 ms | 0.410 ms | 7.800 ms | 20x |
| 5 MB | 5 | 41.585 ms | 2.017 ms | 39.568 ms | 21x |

The 10-session / 5 MB case was not included because the exploratory run exceeded the command timeout after the preceding cases; the trend was already clear.

Correctness constraints in the experimental implementation:
- Cache key changes when header generation/digest/unavailable changes.
- A valid changed activity is re-read.
- Transient read failures are not cached, so the next poll retries.
- Entries no longer present in the directory are evicted.
- Cache is cleared on view disposal.

Relationship to upstream PR #1123:
- #1123 skips the render/layout work after an unchanged presence poll.
- This experiment skips the large activity-file read/parse/hash work before that decision.
- They are complementary and can be combined.
