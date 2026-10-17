# Security review — October 17, 2026

This was a focused, first-party adversarial review, not an independent penetration
test or a security certification. The reviewed public baseline was web commit
`64c958d`, release `f04e0051537b7a4c919a372bbc4faa96307454e0087bbe71485dcc9001ca72a9`.
The hardened web release is
`2c69c5d64a1cd318e9b4789185e88d0a3e9f876192e48c808122b69111a1740f`.

## Scope and threat model

Reviewed save-backup JSON and filesystem boundaries, native preferences,
tournament and replay readers, DOM output, Wasm/JavaScript calls, media integrity,
repository history, GitHub deployment settings and direct runtime dependencies.
Attack tests used disposable browser profiles and local files. No user saves,
running matches or third-party services were attacked. The Windows final EXE
was not rebuilt or replaced.

The browser game is a static client application: it has no application login,
server-side save service or embedded API credential. The useful untrusted-input
boundary is a backup the player chooses to import. Original media is shipped by
the project, not accepted from arbitrary website visitors. Hash checks detect
corruption; they are not signatures and do not protect a compromised publisher.

## Findings and fixes

### Low: imported replay count could exceed the native library limit

The importer accepted 1,001 replay entries because it checked only the overall
1,004-file archive limit. The native replay library refuses more than 1,000 clips.
A player who imported such a backup could persist an unusable replay library.
This requires a deliberate import and does not demonstrate code execution or
data theft. Reproduced against the published baseline with 1,001 entries.

Fixed by checking replay count separately from the four tournament/preferences
slots. The check also covers the combined existing and imported library: two
individually acceptable imports must not bypass the limit. Over-limit merges
are rejected before the first filesystem write; replacements at capacity work.

### Low: merged saves could outgrow the backup size limit

Unrelated replays are retained on import, but the previous limit applied only to
the incoming archive. Repeated imports could accumulate more than 64 MiB and
prevent exporting the complete save set. The resulting library is now checked
against the same 64 MiB limit. Snapshot/export checks file metadata before
allocating contents, then checks the actual bytes as well. This bounds recovery
backup allocations and preserves the ability to export supported save sets.

### Defense in depth: browser content policy

Added a Content-Security-Policy that blocks inline scripts, JavaScript eval,
off-origin connections, plugins, base-URL changes and form submissions. Wasm
compilation remains allowed through `wasm-unsafe-eval`. Inline styles remain
allowed for the existing responsive canvas and SDL presentation. A no-referrer
policy was also added. No exploitable script-injection path was demonstrated;
import details and technical logs use `textContent`, not HTML interpretation.

The initial concern about trailing-newline filenames was disproved by a baseline
test: JavaScript's existing validator already rejected them. No vulnerability
is claimed for those paths. A first CSP probe also produced a false positive
because privileged browser automation evaluation can bypass eval restrictions;
the corrected probe runs as an ordinary page script.

## Evidence

- 36 adversarial save tests: malformed schemas, traversal, alternate separators,
  control characters, HTML-like names, duplicate paths, incorrect lengths and
  checksums, replay capacity, merged capacity and allocation bounds.
- Four browser attack groups: Wasm startup under CSP; inline/eval/off-origin
  request rejection; 1,001-entry import rejection; and merge overflow rejection
  while preserving the original 1,000 files.
- All 19 browser release checks passed in isolated Edge and Firefox profiles,
  including saves, movies, gameplay, fullscreen, controller pause and audio.
- Existing native preferences, save-recovery and rendered replay corruption
  contracts passed (three tests). They include recomputed checksums, invalid
  identities/animation indices, non-finite values, truncation and extent checks.
- An additional 1,800 deterministic checksum-aware mutations completed without
  a crash: tournament 597 rejected / 3 accepted; preferences 598 / 2; replay
  553 / 47. Accepted mutations remained within parser validation; rejection
  preserved tournament/preferences state. This was a bounded corpus without
  sanitizers, not proof of memory safety. Windows rejected the new harness's
  initial Documents-folder write; rerunning in a fresh Temp directory passed.
- High-confidence credential-pattern scans inspected all fetched history:
  1,310 source blobs (99,501,167 bytes), and 186 site blobs (653,565,340 bytes).
  No private-key, GitHub-token, AWS-key, Slack-token or OpenAI-token pattern
  matched. This is not proof that every possible secret format is absent.
- Both repositories use read-only default workflow tokens and disallow workflow
  PR approval. No repository rulesets were configured. The site uses HTTPS/HSTS.

The reproducible local tools are `tools/test_web_security.cjs`,
`tools/test_browser_security.cjs`, `tools/audit_public_history.py`, and the
`save_security_tests` CMake target. Evidence is retained in the parent outputs
folder under `qa/security-*`, `qa/red-team-*-history.json` and
`qa/save-mutation-results.txt`.

## Dependency review and remaining limits

The inspected build uses SDL 3.4.18 and Emscripten 6.0.12. No npm package or
third-party CDN script is loaded by the application. The upstream
[SDL repository advisories](https://github.com/libsdl-org/SDL/security/advisories)
and [Emscripten repository advisories](https://github.com/emscripten-core/emscripten/security/advisories)
APIs returned empty published lists on the review date. This is a limited advisory
check, not a complete CVE/SBOM audit of toolchain and bundled decoder components.

Remaining limits and recommendations:

- This is not exhaustive native fuzzing, sanitizer coverage, a browser-engine
  audit, or a review of every historical game/media decoding routine.
- GitHub Pages does not provide this project with custom response-header
  controls. The meta CSP cannot enforce `frame-ancestors`; clickjacking headers
  and `X-Content-Type-Options` are absent. No sensitive authenticated server
  operations exist, but stronger headers would require another hosting setup.
- Other projects at `plicerin.github.io` share the browser origin. CSP `self`
  and browser storage are not isolation boundaries between those projects.
  A dedicated domain would provide stronger origin separation if needed.
- Public repository write access remains trusted. Consider protected branches
  and review requirements before adding collaborators. No ownership, access or
  branch-policy changes were made as part of this review.
- Physical controllers, Safari and subjective audio quality are outside this
  security review. Automated tests cannot establish that the game is bug-free.

No critical or high-severity exploit was demonstrated within this scope.
