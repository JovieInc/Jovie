# Lint a Pen snapshot without opening or editing it

```sh
pnpm lint:pen -- ./review.pen
pnpm lint:pen -- ./review.pen --json
pnpm lint:pen -- ./review.pen --policy ./identity.policy.json --library ds=./approved-design.lib.pen
node --test scripts/pen-review/lint.test.mjs
```

Use an approved frozen copy, never the live editor buffer. The command does not
start Pen, execute scripts embedded in it, follow import URIs, write its input
or emit certification. It is manual and report-only; no CI or merge gate calls
it. Exit code `0` means no lint errors, `1` means lint findings at error
severity, and `2` means the invocation or primary input could not be read.
Unverified references and warnings are not passes. `--json` is a versioned
report with severity, rule, file, page/frame/node IDs where present, JSON path,
value and remediation.

Supported file formats are exactly 2.17, the flat native format in Pen's
[Button and Card example](https://docs.pen.dev/design-systems/build-a-design-system),
and 2.26, the native Page-based format in the
[published schema](https://docs.pen.dev/for-developers/the-pen-format). A
version mismatch is not permission to relabel a file. Open/save an approved
copy in a supported Pen runtime to migrate it or extend the checker using a
native specimen of that version.

Local IDs, qualified imported refs, slots, native variant axes and override
paths are checked structurally. References to a declared library without
explicit approved bytes are `unverified`. `--library alias=PATH` supplies
one exact, local snapshot to check, not permission to discover or trust
another file of the same name. Transitive imports are not followed.

## Optional ID-scoped policy

The policy is supplied per approved snapshot. It is not a built-in list of
current Jovie IDs or a license to update component origins. For example:

```json
{
  "version": 1,
  "penVersion": "2.26",
  "surfaces": [
    {
      "key": "identity",
      "candidates": [
        { "id": "identity-active", "state": "canonical" },
        { "id": "identity-previous", "state": "archive" },
        { "id": "identity-mobile-idea", "state": "alternate" }
      ],
      "instances": [
        { "within": "inspector", "node": "entity", "ref": "ds:sidebar-card" },
        {
          "within": "inspector",
          "node": "tabs",
          "ref": "ds:workspace-tabs",
          "variant": { "density": "compact" }
        }
      ],
      "entityShareTabs": [
        {
          "placements": [
            { "parent": "inspector", "children": ["entity", "share", "tabs"] }
          ]
        }
      ],
      "bindings": [
        {
          "node": "share",
          "property": ["fill"],
          "variable": "$ds:surface",
          "allowLiterals": ["#18181B"]
        }
      ]
    }
  ]
}
```

- Declare candidates by durable frame ID. The checker can also read a frame's
  explicit `metadata: {"type":"jovie.design/v1","surface":"identity","state":"canonical"}`.
  It never decides which design is canonical from its title, coordinates or
  visual resemblance. Archive and alternate states remain in the document.
- A required instance must directly reference the given origin. The optional
  `within` allows a structural scope; the optional `node` requires the exact
  occurrence. A variant requirement compares actual native selection, including
  axis defaults. A same-looking detached frame does not count.
- Each ordering rule can list more than one explicitly allowed placement. The
  three IDs stand for Entity, Share, Tabs. Direct ordered children in a
  vertical stack are enforceable. Absolute or nonvertical layout requires
  native visual review; a matching shape elsewhere is not evidence.
- Binding checks apply only to named properties. Native variable aliases can
  resolve to the required binding; equal-looking colors do not. An explicit
  literal exception applies to that one property only. Contents of notes,
  metadata, and unscoped literals are not treated as design drift.

A syntactically valid, populated document can still open blank because of
editor version, page selection, viewport or draw/runtime problems. This
checker can flag absent or malformed structure, not assert the native file is
visible, measures correctly, scrolls, behaves interactively or passes taste.
The real canonical file has not been examined by this checker.

A populated review document that was observed blank in native Pen is a
negative control: its valid 2.26 Page/frame structure produced zero lint
findings. Do not use a zero-finding report as a substitute for opening the
intended frame and verifying the native render after reopen. The private
review bytes are not a test fixture in this repository.
