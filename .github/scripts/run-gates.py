#!/usr/bin/env python3
"""Run folio-assistant-core's gates in a mounted index and record each exit code.

Usage: run-gates.py <index-root> <out.json>

Two sets, both DERIVED rather than listed here, so a gate added to either
source is run with no edit to this file:

- **graph**: the harness's consistency checks, run over THIS instance. They
  come from cat-harness-tools; each one names the instance the way its own
  flag asks for it (`GRAPH_GATES` below is the only list, and it is a list of
  harness commands, not of core's gates).
- **core**: this instance's own QA, every `checkoutScripts` entry of
  `folio-assistant-core/package.json` whose name starts `check:` or ends
  `:check`.

Each gate's exit code, the tail of its output, and its command are written to
<out.json>. This script exits 0 whatever the gates did: the compare step
judges head against base, so a gate already red on main does not fail a PR
that did not break it.
"""
import json
import os
import shlex
import subprocess
import sys

INSTANCE = "folio-assistant-core"

# The harness's graph checks, scoped to this instance where the check takes a
# scope (kg-audit, kg-export, import-direction). check-tools and
# declaration-resolution read the whole checkout; the base/head comparison is
# what attributes a change in them to this PR.
GRAPH_GATES = {
    "kg-audit": f"bun cat-harness-tools/scripts/kg-audit.ts --instance ./{INSTANCE}",
    "check-tools": "bun cat-harness-tools/scripts/check-tools.ts",
    "kg-export": f"bun cat-harness-tools/scripts/kg-export.ts --instance ./{INSTANCE} --out {{tmp}}/{INSTANCE}.jsonld",
    "import-direction": f"bun cat-harness-tools/scripts/check-import-direction.ts --gate {INSTANCE}",
    "declaration-resolution": "bun cat-harness-tools/scripts/check-declaration-resolution.ts",
}


def core_gates(root):
    with open(os.path.join(root, INSTANCE, "package.json")) as f:
        scripts = json.load(f).get("checkoutScripts", {})
    out = {}
    for name, command in sorted(scripts.items()):
        if name.startswith("check:") or name.endswith(":check"):
            # `bun run <path> …` → `bun <path> …`, run from the index root as
            # every checkoutScripts path is written.
            out[name] = command.replace("bun run ", "bun ", 1)
    return out


def main():
    root, out_path = sys.argv[1], sys.argv[2]
    tmp = os.environ.get("RUNNER_TEMP", "/tmp")
    gates = {f"graph:{k}": v.format(tmp=tmp) for k, v in GRAPH_GATES.items()}
    gates.update({f"core:{k}": v for k, v in core_gates(root).items()})
    results = {}
    for name, command in gates.items():
        print(f"::group::{name}: {command}", flush=True)
        p = subprocess.run(shlex.split(command), cwd=root, capture_output=True, text=True, timeout=1200)
        text = (p.stdout + p.stderr).strip()
        print(text[-4000:], flush=True)
        print("::endgroup::", flush=True)
        results[name] = {"command": command, "exit": p.returncode, "tail": text[-1500:]}
        print(f"{name}: exit {p.returncode}", flush=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=1)


if __name__ == "__main__":
    main()
