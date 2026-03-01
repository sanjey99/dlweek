Param(
  [string]$Branch = "autopilot/night-20260228",
  [int]$Cycles = 6,
  [int]$SleepSeconds = 20
)

$ErrorActionPreference = "Stop"

function Ensure-Branch {
  git fetch origin
  $exists = git branch --list $Branch
  if (-not $exists) {
    git checkout -b $Branch
    git push -u origin $Branch
  } else {
    git checkout $Branch
    git pull --rebase origin $Branch
  }
}

function Next-PacketId {
  $inbox = Get-Content "JARVIS_INBOX.md" -Raw
  $m = [regex]::Match($inbox, "## Packet (P-\d{3}).*?Status:\s*TODO", [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

function Append-Outbox($packetId, $status, $notes) {
  $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Add-Content "COPILOT_OUTBOX.md" "`n### Cycle Timestamp (UTC): $ts"
  Add-Content "COPILOT_OUTBOX.md" "Status: $status"
  Add-Content "COPILOT_OUTBOX.md" "Packet ID: $packetId"
  Add-Content "COPILOT_OUTBOX.md" "Completed:"
  Add-Content "COPILOT_OUTBOX.md" "- $notes"
  Add-Content "COPILOT_OUTBOX.md" "Files changed:"
  Add-Content "COPILOT_OUTBOX.md" "- (auto-fill by worker)"
  Add-Content "COPILOT_OUTBOX.md" "Commits:"
  Add-Content "COPILOT_OUTBOX.md" "- (auto-fill by worker)"
  Add-Content "COPILOT_OUTBOX.md" "Checks run:"
  Add-Content "COPILOT_OUTBOX.md" "- (auto-fill by worker)"
  Add-Content "COPILOT_OUTBOX.md" "Blockers:"
  Add-Content "COPILOT_OUTBOX.md" "- none"
  Add-Content "COPILOT_OUTBOX.md" "Questions for Jarvis:"
  Add-Content "COPILOT_OUTBOX.md" "- none"
  Add-Content "COPILOT_OUTBOX.md" "Proposed next action:"
  Add-Content "COPILOT_OUTBOX.md" "- proceed to next packet"
}

Write-Host "== Hackathon Autopilot Helper =="
Ensure-Branch

for ($i=1; $i -le $Cycles; $i++) {
  git pull --rebase origin $Branch
  $pid = Next-PacketId
  if (-not $pid) {
    Write-Host "No TODO packets found. Exiting."
    break
  }

  Write-Host "Cycle $i/$Cycles | Next packet: $pid"
  Write-Host "1) Ask Copilot to execute packet in JARVIS_INBOX.md"
  Write-Host "2) After Copilot edits files, press ENTER to continue commit/push"
  Read-Host

  $dirty = git status --porcelain
  if (-not $dirty) {
    Write-Host "No file changes detected. Logging PARTIAL and continuing."
    Append-Outbox $pid "PARTIAL" "No changes detected after worker run"
    git add COPILOT_OUTBOX.md
    git commit -m "$pid: outbox update (no code changes)" | Out-Null
    git push origin $Branch
    Start-Sleep -Seconds $SleepSeconds
    continue
  }

  git add .
  git commit -m "$pid: autopilot cycle update" | Out-Null
  git push origin $Branch
  Write-Host "Committed and pushed for $pid"
  Start-Sleep -Seconds $SleepSeconds
}

Write-Host "Autopilot helper done."
