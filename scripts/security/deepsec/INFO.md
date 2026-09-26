# Jovie DeepSec context

This policy-only layer for the planned DeepSec 2.3.8 integration is disabled. It installs no DeepSec dependency. The policy names nine reviewed TypeScript security paths. This layer does not create a source snapshot or invoke the scanner. The planned bounded known-pattern filter would not prove that source contains no secrets.

The policy records the existing prepaid Codex subscription route, pins Codex `gpt-5.5`, forbids provider fallback, and stops on subscription exhaustion. No model call, scanner run, issue write, or repair is authorized by this layer.

The upstream local process may expose write-capable tools, and its auth file path and executable route are not yet proven isolated. Keep this config blocked until source-write denial, auth-read isolation, subscription-route identity, and exact Codex executable provenance are independently demonstrated. Findings and fixes must continue through the existing owners and review gates.
