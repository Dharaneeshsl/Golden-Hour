param([Parameter(Mandatory)][string]$PostgresBin, [switch]$Browser)
$ErrorActionPreference = 'Stop'
$cluster = Join-Path ([IO.Path]::GetTempPath()) ("goldenhour-integration-" + [guid]::NewGuid())
$pw = "$cluster.pw"
$secret = [guid]::NewGuid().ToString("N")
$oldUrl = $env:DATABASE_URL
$oldPassword = $env:PGPASSWORD
Push-Location (Join-Path $PSScriptRoot '..')
try {
    Set-Content -LiteralPath $pw -Value $secret -Encoding ascii
    & (Join-Path $PostgresBin 'initdb.exe') -D $cluster -U gh_test -A scram-sha-256 --encoding=UTF8 "--pwfile=$pw"
    if ($LASTEXITCODE) { throw "Database initialization failed" }
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster -l "$cluster/test.log" -o "-h 127.0.0.1 -p 55439" -w start
    if ($LASTEXITCODE) { throw "Temporary database startup failed" }
    try {
        $env:DATABASE_URL = "postgresql://gh_test:${secret}@127.0.0.1:55439/postgres"
        node src/config/migrate.js
        if ($LASTEXITCODE) { throw "Migration failed" }
        $env:RESTORE_TEST_KEY = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($secret))
        node --test --test-concurrency=1 integration/postgres-login.js integration/reliability.test.js integration/key-rotation.test.js
        if ($LASTEXITCODE) { throw "Database regression failed" }
        if ($Browser) {
            node integration/browser.js
            if ($LASTEXITCODE) { throw "Browser workflow failed" }
        }
        $env:RESTORE_EXPECTED_FILE = Join-Path $cluster "restore-manifest.json"
        node integration/verify-restored.js --snapshot
        if ($LASTEXITCODE) { throw "Restore source manifest failed" }
        $env:PGPASSWORD = $secret
        $dump = Join-Path $cluster "restore-check.dump"
        & (Join-Path $PostgresBin 'pg_dump.exe') -h 127.0.0.1 -p 55439 -U gh_test -d postgres -Fc -f $dump
        if ($LASTEXITCODE) { throw "Backup failed" }
        & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p 55439 -U gh_test goldenhour_restore
        if ($LASTEXITCODE) { throw "Restore database creation failed" }
        & (Join-Path $PostgresBin 'pg_restore.exe') -h 127.0.0.1 -p 55439 -U gh_test -d goldenhour_restore --exit-on-error $dump
        if ($LASTEXITCODE) { throw "Restore failed" }
        $env:DATABASE_URL = "postgresql://gh_test:${secret}@127.0.0.1:55439/goldenhour_restore"
        node integration/verify-restored.js
        if ($LASTEXITCODE) { throw "Restored ciphertext validation failed" }
    } finally {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster -m fast -w stop
    }
} finally {
    $env:DATABASE_URL = $oldUrl
    $env:PGPASSWORD = $oldPassword
    Remove-Item Env:RESTORE_EXPECTED_FILE -ErrorAction SilentlyContinue
    Remove-Item Env:RESTORE_TEST_KEY -ErrorAction SilentlyContinue
    Pop-Location
    Remove-Item -LiteralPath $pw -ErrorAction SilentlyContinue
    $resolved = [IO.Path]::GetFullPath($cluster)
    if ([IO.Path]::GetDirectoryName($resolved) -eq [IO.Path]::GetTempPath().TrimEnd('\') -and
        [IO.Path]::GetFileName($resolved) -match '^goldenhour-integration-[a-f0-9-]{36}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    }
}
