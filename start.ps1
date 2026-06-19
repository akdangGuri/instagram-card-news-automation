$ErrorActionPreference = "Stop"

$node = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  Write-Error "Bundled Node.js was not found at $node"
}

& $node server.mjs
