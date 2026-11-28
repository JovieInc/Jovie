# Public OpenPGP fixtures for the Doppler keyring installer

These fixed public keys let `tests/unit/ci/setup-doppler-action.test.ts` exercise
real GPG inspection and dearmoring without generating secret keys or starting a
signing agent. The test reads committed bytes; it has no system-keyring or
network dependency. The production Doppler fingerprint remains in the action.

The armored bytes were copied from the matching files in
`/etc/apt/trusted.gpg.d/` in the implementation environment. On 2026-11-27 UTC,
independent HTTPS downloads from the official URLs below had the same SHA-256
values as the committed files. No key export, filtering or normalization was
performed. Repository attributes preserve LF line endings.

| Committed file | Official public-key source | SHA-256 of armored bytes |
| --- | --- | --- |
| `debian-archive-bookworm-automatic.asc` | <https://ftp-master.debian.org/keys/archive-key-12.asc> | `c2a9a16fde95e037bafd0fa6b7e31f41b4ff1e85851de5558f19a2a2f0e955e2` |
| `debian-archive-bookworm-security-automatic.asc` | <https://ftp-master.debian.org/keys/archive-key-12-security.asc> | `74f81645b4e3156d1e9a88c8dd9259271b89c7099d64af89a2a6996b592faa1f` |

Debian's [2023-03-09 announcement](https://lists.debian.org/debian-devel-announce/2023/03/msg00001.html)
publishes these full primary and signing-subkey fingerprints independently of
the downloaded bytes:

| Public key | Primary fingerprint | Signing-subkey fingerprint |
| --- | --- | --- |
| Debian Archive Automatic Signing Key (12/bookworm) | `B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8` | `4CB50190207B4758A3F73A796ED0E7B82643E131` |
| Debian Security Archive Automatic Signing Key (12/bookworm) | `05AB90340C0C5E797F44A8C8254CF3B5AEC0A8F0` | `B0CAB9266E8C3929798B3EEEBDE6D2B9216EC7A8` |

GnuPG 2.4.7 `--show-keys --with-colons` returned exit 0 for both files and
reported one primary key and one signing subkey per file, with these exact
fingerprints. `--list-packets` reported one public-key packet and one public
subkey packet per file, with zero secret-key packets. The test pins both file
digests, verifies the installed primary/subkey pair, and concatenates the two
public blocks to exercise multiple-primary rejection. Primary counts use `pub`
records, since each valid signing subkey also has an `fpr` record.

Reproduce the installer tests from the repository root:

```sh
pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/setup-doppler-action.test.ts
```
