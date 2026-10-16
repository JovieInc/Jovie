# Deterministic artist profile previews

`previewArtistProfileChanges` consumes the existing `ArtistProfileSnapshot`, a
versioned `ArtistProfilePreviewManifest`, an exact target account, selected fields,
verified connection authorization/evidence, optional destination observations and
image metadata, and an explicit clock. It performs no I/O or provider writes.

Each field returns its canonical value and provenance, exact outbound value,
authorized destination observation when supplied, validation checks, warnings,
blockers, required OAuth/role policy, pending confirmation, evidence references
and image facts, and rollback posture. Only identity and explicit trim transforms
are supported; values are never truncated or URLs silently normalized.

A `confirmable` result means the plan can be shown for explicit confirmation.
It is not a write grant, approval receipt, or proof of provider success. Evidence
references must come from trusted verification; manifest evidence requirements
also describe the obligations of the eventual executor, including audit/readback.
Snapshot restore requires a readable before-value. Known unsupported rollback is
shown as a warning rather than advertised as reversible.

The SHA-256 checksum binds the canonical revision, manifest version and contents,
all three account selectors, sorted selection, exact outbound values, observations,
evidence and validation results. Reordered selection and object keys are stable.
Changes to reviewed image facts or before-values also invalidate confirmation.
An executor must reload and revalidate all inputs and require this checksum from
the explicit confirmation before considering a write. Existing DSP research
catalog entries remain unavailable; this module grants no new provider capability.
