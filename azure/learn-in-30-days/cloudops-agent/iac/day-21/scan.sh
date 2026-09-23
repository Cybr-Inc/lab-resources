#!/usr/bin/env bash
set -euo pipefail

# Release check for the proposed CloudOps change.
# Exits non-zero while any built-in check or organization policy reports a
# violation, so a pipeline can use this script as a required gate.

checkov --directory . \
  --framework terraform \
  --external-checks-dir policy \
  --quiet

printf 'Release check passed: no violations found.\n'
