# Qualification checkout safety

Qualification uses the trusted release's `qualification_guard.py`, before importing
anything from a candidate checkout. The fixed policy requires commit
`5db1a60487c0a29dda45315d9aa5da14493d9409` in the target's actual ancestry and the
reviewed isolated `scripts/tests/test_disk_guard.py` bytes. A newer installed
release or an updated `origin/main` does not make an older candidate safe.

The native gate fetches objects with Git hooks disabled, proves the target source
before checkout, prepares it with hooks disabled and no unverified checkout
filters, then verifies exact HEAD, index and working fixture bytes. It repeats
that observation after a gate-seat wait and immediately before every candidate
command. Unknown observations defer the gate without a passing receipt. A
fixture change requires a separately reviewed policy update.

For a read-only observation, invoke the helper from the installed release:

```sh
python3 -I "$trusted_release/qualification_guard.py" --repo "$candidate" --head "$exact_head"
```

A manual qualification launcher must import that same trusted helper and use
`load_checked_runner(candidate, exact_head)` before loading the runner.
Use a dedicated isolated Python interpreter (`python3 -I`) so startup imports
also exclude candidate paths. The returned runner and its dependencies come from
the trusted release and interpreter libraries. Cached candidate modules and
cached siblings from another release are refused; import-path quarantine remains
in effect for later lazy imports. Git safety observations disable implicit
promisor fetching, so missing local objects hold without executing a remote helper.
The launcher retains the native exact-head reservation and exclusive checkout
ownership, and rechecks safety immediately before candidate commands. A passing
observation is a bounded source check, not a lease or a qualification result.

The regressions use temporary repositories and fake operator workspaces. They
must never import an old production disk-cleanup fixture or exercise a real
workspace cleanup path to demonstrate rejection.
