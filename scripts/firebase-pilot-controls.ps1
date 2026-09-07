[CmdletBinding()]
param(
  [string]$ProjectId = 'theantibalcony',
  [string]$DatabaseId = '(default)',
  [string]$StorageBucket = '',
  [string]$EvidenceDirectory = 'artifacts/pilot-evidence',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Invoke-ExternalText {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $output = & $Command @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { [string]$_ }) -join "`n"
  if ($exitCode -ne 0) {
    throw "$Command failed with exit code $exitCode.`n$text"
  }
  return $text
}

function Invoke-ExternalJson {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $text = Invoke-ExternalText -Command $Command -Arguments $Arguments
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  try {
    return $text | ConvertFrom-Json
  } catch {
    throw "Could not parse JSON from $Command. Raw output:`n$text"
  }
}

function Firebase-Result {
  param($Value)
  if ($null -eq $Value) { return $null }
  if ($Value.PSObject.Properties.Name -contains 'result') { return $Value.result }
  return $Value
}

function Json-Text {
  param($Value)
  if ($null -eq $Value) { return '' }
  return ($Value | ConvertTo-Json -Depth 40 -Compress)
}

function Test-PitrEnabled {
  param($Database)
  $text = Json-Text $Database
  return ($text -match 'POINT_IN_TIME_RECOVERY_ENABLED') -or
         ($text -match '"pointInTimeRecovery[^"\\]*"\s*:\s*"ENABLED"')
}

function Test-ScheduleType {
  param($Schedules, [ValidateSet('DAILY','WEEKLY')][string]$Type)
  $text = Json-Text $Schedules
  if ($Type -eq 'DAILY') {
    return ($text -match '"recurrence"\s*:\s*"DAILY"') -or ($text -match 'dailyRecurrence')
  }
  return ($text -match '"recurrence"\s*:\s*"WEEKLY"') -or ($text -match 'weeklyRecurrence')
}

function Get-FirebaseState {
  param([string]$Project, [string]$Database)

  $databaseRaw = Invoke-ExternalJson 'firebase' @(
    'firestore:databases:get', $Database,
    '--project', $Project,
    '--json', '--non-interactive'
  )

  $schedulesRaw = Invoke-ExternalJson 'firebase' @(
    'firestore:backups:schedules:list',
    '--database', $Database,
    '--project', $Project,
    '--json', '--non-interactive'
  )

  $backupsRaw = Invoke-ExternalJson 'firebase' @(
    'firestore:backups:list',
    '--project', $Project,
    '--json', '--non-interactive'
  )

  $rtdbRaw = Invoke-ExternalJson 'firebase' @(
    'database:instances:list',
    '--project', $Project,
    '--json', '--non-interactive'
  )

  return [ordered]@{
    database = Firebase-Result $databaseRaw
    schedules = Firebase-Result $schedulesRaw
    backups = Firebase-Result $backupsRaw
    rtdb_instances = Firebase-Result $rtdbRaw
  }
}

Require-Command 'firebase'
if ($StorageBucket) { Require-Command 'gcloud' }

Write-Host "FinClose Firebase pilot-control helper"
Write-Host "Project: $ProjectId"
Write-Host "Database: $DatabaseId"
Write-Host ("Mode: " + $(if ($Apply) { 'APPLY SAFE CONFIGURATION' } else { 'READ-ONLY STATUS' }))
Write-Host ''

# Confirm that the authenticated Firebase account can see the intended project.
$projectsRaw = Invoke-ExternalJson 'firebase' @('projects:list', '--json', '--non-interactive')
$projects = Firebase-Result $projectsRaw
$projectsText = Json-Text $projects
if ($projectsText -notmatch [regex]::Escape($ProjectId)) {
  throw "The authenticated Firebase CLI account cannot see project '$ProjectId'. Run 'firebase login' with an authorized account first."
}

$before = Get-FirebaseState -Project $ProjectId -Database $DatabaseId
$actions = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

if ($Apply) {
  if (-not (Test-PitrEnabled $before.database)) {
    Write-Host 'Enabling Firestore PITR...'
    Invoke-ExternalText 'firebase' @(
      'firestore:databases:update', $DatabaseId,
      '--point-in-time-recovery', 'ENABLED',
      '--project', $ProjectId,
      '--non-interactive'
    ) | Out-Null
    $actions.Add('Enabled Firestore point-in-time recovery.')
  } else {
    $actions.Add('Firestore PITR already enabled; no change.')
  }

  if (-not (Test-ScheduleType $before.schedules 'DAILY')) {
    Write-Host 'Creating daily Firestore backup schedule (4-week retention)...'
    Invoke-ExternalText 'firebase' @(
      'firestore:backups:schedules:create',
      '--database', $DatabaseId,
      '--recurrence', 'DAILY',
      '--retention', '4w',
      '--project', $ProjectId,
      '--non-interactive'
    ) | Out-Null
    $actions.Add('Created daily Firestore backup schedule with 4-week retention.')
  } else {
    $actions.Add('A daily Firestore backup schedule already exists; it was not replaced.')
    $warnings.Add('Verify the existing daily schedule retention is 4 weeks. This helper does not overwrite an existing schedule automatically.')
  }

  if (-not (Test-ScheduleType $before.schedules 'WEEKLY')) {
    Write-Host 'Creating Sunday Firestore backup schedule (14-week retention)...'
    Invoke-ExternalText 'firebase' @(
      'firestore:backups:schedules:create',
      '--database', $DatabaseId,
      '--recurrence', 'WEEKLY',
      '--retention', '14w',
      '--day-of-week', 'SUNDAY',
      '--project', $ProjectId,
      '--non-interactive'
    ) | Out-Null
    $actions.Add('Created Sunday Firestore backup schedule with 14-week retention.')
  } else {
    $actions.Add('A weekly Firestore backup schedule already exists; it was not replaced.')
    $warnings.Add('Verify the existing weekly schedule runs Sunday and retains backups for 14 weeks. This helper does not overwrite an existing schedule automatically.')
  }

  if ($StorageBucket) {
    Write-Host "Setting Cloud Storage soft-delete retention to 30 days on gs://$StorageBucket..."
    Invoke-ExternalText 'gcloud' @(
      'storage', 'buckets', 'update', "gs://$StorageBucket",
      '--soft-delete-duration=30d',
      '--quiet'
    ) | Out-Null
    $actions.Add("Set Cloud Storage soft-delete duration to 30 days on gs://$StorageBucket.")
  } else {
    $warnings.Add('StorageBucket was not supplied; Cloud Storage soft-delete was not changed or verified by this helper.')
  }
}

$after = Get-FirebaseState -Project $ProjectId -Database $DatabaseId

$storageState = $null
if ($StorageBucket) {
  $storageState = Invoke-ExternalJson 'gcloud' @(
    'storage', 'buckets', 'describe', "gs://$StorageBucket",
    '--format=json'
  )
}

$pitrEnabled = Test-PitrEnabled $after.database
$dailyPresent = Test-ScheduleType $after.schedules 'DAILY'
$weeklyPresent = Test-ScheduleType $after.schedules 'WEEKLY'

$evidence = [ordered]@{
  evidence_version = 'FINCLOSE-FIREBASE-PILOT-CONTROLS-PS1-V1'
  generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
  mode = $(if ($Apply) { 'APPLY' } else { 'READ_ONLY' })
  project_id = $ProjectId
  database_id = $DatabaseId
  storage_bucket = $(if ($StorageBucket) { $StorageBucket } else { $null })
  summary = [ordered]@{
    firestore_pitr_enabled = $pitrEnabled
    daily_backup_schedule_detected = $dailyPresent
    weekly_backup_schedule_detected = $weeklyPresent
    storage_soft_delete_inspected = [bool]$StorageBucket
    rtdb_automated_backup_verification = 'MANUAL_FIREBASE_CONSOLE_CHECK_REQUIRED'
    restore_rehearsal = 'MANUAL_CONTROLLED_RESTORE_REQUIRED'
  }
  actions = @($actions)
  warnings = @($warnings)
  firestore_database = $after.database
  firestore_backup_schedules = $after.schedules
  firestore_backups = $after.backups
  rtdb_instances = $after.rtdb_instances
  storage_bucket_metadata = $storageState
  manual_next_steps = @(
    'In Firebase Console > Realtime Database > Backups, enable/verify daily automated backup, Gzip and the 30-day lifecycle option.',
    'After at least one Firestore scheduled backup completes, record its backup ID and timestamp.',
    'Perform a non-destructive Firestore restore rehearsal to a NEW database ID; never delete the live default database for the rehearsal.',
    'Complete docs/BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md from the captured evidence.',
    'Do not set FINCLOSE_BACKUP_PITR_VERIFIED=YES until the full evidence record is PASS.'
  )
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidencePath = Join-Path $EvidenceDirectory "firebase-pilot-controls-$stamp.json"
$evidence | ConvertTo-Json -Depth 40 | Set-Content -Path $evidencePath -Encoding UTF8

Write-Host ''
Write-Host 'Current status:'
Write-Host "  Firestore PITR enabled: $pitrEnabled"
Write-Host "  Daily backup schedule detected: $dailyPresent"
Write-Host "  Weekly backup schedule detected: $weeklyPresent"
Write-Host "  Storage soft delete inspected: $([bool]$StorageBucket)"
Write-Host "  RTDB automated backup: manual Firebase-console verification required"
Write-Host "  Restore rehearsal: still required"
Write-Host ''
Write-Host "Evidence written to: $evidencePath"

if ($warnings.Count -gt 0) {
  Write-Host ''
  Write-Warning ($warnings -join ' ')
}

if (-not $pitrEnabled -or -not $dailyPresent -or -not $weeklyPresent) {
  if (-not $Apply) {
    Write-Host ''
    Write-Host 'One or more Firestore controls are not detected. Re-run with -Apply after reviewing the intended changes.'
  } else {
    throw 'One or more required Firestore controls are still not detected after apply. Review the evidence JSON and Firebase CLI output.'
  }
}
