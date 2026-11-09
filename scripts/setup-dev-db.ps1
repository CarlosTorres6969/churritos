param([switch]$StartServer)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$environmentPath = Join-Path $projectRoot '.env.development.local'
$schemaPath = Join-Path $projectRoot 'database/schema.dev.sql'
$seedPath = Join-Path $projectRoot 'database/seed.dev.sql'
$databaseName = 'ChurritosDev'
$applicationLogin = 'churritos_dev'
$serviceName = 'MSSQL$SQLEXPRESS'
$serverAddress = '127.0.0.1,1433'
$statusPath = Join-Path $projectRoot '.next/dev-db-setup-result.json'

function Save-SetupStatus {
  param([hashtable]$Status)
  [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $statusPath))
  $json = ConvertTo-Json -InputObject $Status -Compress
  [System.IO.File]::WriteAllText($statusPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function New-DevelopmentPassword {
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $bytes = New-Object byte[] 20
    $random.GetBytes($bytes)
    return 'Dev!9' + [System.BitConverter]::ToString($bytes).Replace('-', '')
  } finally { $random.Dispose() }
}

function Invoke-DatabaseCommand {
  param($Connection, [string]$Sql, [hashtable]$Parameters = @{}, $Transaction = $null, [switch]$Scalar)
  $command = $Connection.CreateCommand()
  try {
    $command.CommandText = $Sql
    $command.CommandTimeout = 30
    if ($null -ne $Transaction) { $command.Transaction = $Transaction }
    foreach ($name in $Parameters.Keys) {
      [void]$command.Parameters.AddWithValue('@' + $name, $Parameters[$name])
    }
    if ($Scalar) { return $command.ExecuteScalar() }
    [void]$command.ExecuteNonQuery()
  } finally { $command.Dispose() }
}

function Read-LocalEnvironment {
  $values = @{}
  if (Test-Path -LiteralPath $environmentPath) {
    foreach ($line in [System.IO.File]::ReadAllLines($environmentPath)) {
      if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
          $value = ConvertFrom-Json -InputObject $value
        } elseif ($value.StartsWith("'") -and $value.EndsWith("'")) {
          $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$name] = $value
      }
    }
  }
  return $values
}

function Save-LocalEnvironment {
  param([hashtable]$Entries)
  $content = if (Test-Path -LiteralPath $environmentPath) { [System.IO.File]::ReadAllText($environmentPath) } else { '' }
  foreach ($name in ($Entries.Keys | Sort-Object)) {
    $value = [string]$Entries[$name]
    $serialized = ConvertTo-Json -InputObject $value -Compress
    $line = $name + '=' + $serialized
    $pattern = '(?m)^' + [regex]::Escape($name) + '=[^\r\n]*'
    if ([regex]::IsMatch($content, $pattern)) {
      $replacement = [System.Text.RegularExpressions.MatchEvaluator]({ param($match) $line }.GetNewClosure())
      $content = [regex]::Replace($content, $pattern, $replacement)
    } else {
      $content = $content.TrimEnd() + "`r`n" + $line + "`r`n"
    }
  }
  [System.IO.File]::WriteAllText($environmentPath, $content, (New-Object System.Text.UTF8Encoding($false)))
}

$masterConnection = $null
$developmentConnection = $null
$applicationConnection = $null
try {
  Save-SetupStatus @{ success = $false; state = 'starting' }
  foreach ($file in @($schemaPath, $seedPath)) {
    if (-not (Test-Path -LiteralPath $file)) { throw 'A development SQL script is missing.' }
  }
  $environment = Read-LocalEnvironment
  $connectionBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $connectionBuilder['Data Source'] = 'lpc:.\SQLEXPRESS'
  $connectionBuilder['Initial Catalog'] = 'master'
  $connectionBuilder['Integrated Security'] = $true
  $connectionBuilder['Encrypt'] = $true
  $connectionBuilder['TrustServerCertificate'] = $true
  $connectionBuilder['Connect Timeout'] = 8

  $applicationPassword = $null
  if ($environment.ContainsKey('DEV_DB_CONNECTION_STRING') -and $environment['DEV_DB_CONNECTION_STRING']) {
    $existing = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($environment['DEV_DB_CONNECTION_STRING'])
    if ($existing['Data Source'] -notin @($serverAddress, ('tcp:' + $serverAddress)) -or $existing['Initial Catalog'] -ne $databaseName -or $existing['User ID'] -ne $applicationLogin) {
      throw 'An existing development connection targets another database; it will not be overwritten.'
    }
    $applicationPassword = $existing['Password']
  }

  $service = Get-Service -Name $serviceName
  if ($service.Status -ne 'Running') {
    if (-not $StartServer) { throw 'SQL Server Express is stopped. Run npm run db:dev to start it.' }
    Start-Service -Name $serviceName
    $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(25))
  }

  $masterConnection = New-Object System.Data.SqlClient.SqlConnection($connectionBuilder.ConnectionString)
  $masterConnection.Open()
  $instanceName = Invoke-DatabaseCommand $masterConnection "SELECT CONVERT(nvarchar(128), SERVERPROPERTY('InstanceName'))" -Scalar
  if ($instanceName -ne 'SQLEXPRESS') { throw 'The local SQL Server instance is not SQLEXPRESS; no database will be changed.' }
  $databaseExists = [int](Invoke-DatabaseCommand $masterConnection 'SELECT COUNT(*) FROM sys.databases WHERE name = @name' @{ name = $databaseName } -Scalar)
  if ($databaseExists -gt 0) {
    $connectionBuilder['Initial Catalog'] = $databaseName
    $developmentConnection = New-Object System.Data.SqlClient.SqlConnection($connectionBuilder.ConnectionString)
    $developmentConnection.Open()
    $marked = [int](Invoke-DatabaseCommand $developmentConnection "SELECT COUNT(*) FROM sys.extended_properties WHERE class = 0 AND name = 'ChurritosDevelopment' AND CONVERT(nvarchar(10), value) = '1'" -Scalar)
    if ($marked -ne 1) { throw 'ChurritosDev already exists without the development marker; it will not be modified.' }
  }
  $loginExists = [int](Invoke-DatabaseCommand $masterConnection 'SELECT COUNT(*) FROM sys.sql_logins WHERE name = @name' @{ name = $applicationLogin } -Scalar)
  if ($loginExists -gt 0 -and -not $applicationPassword) { throw 'The local development login already exists; supply its password before running setup.' }
  if (-not $applicationPassword) { $applicationPassword = New-DevelopmentPassword }

  $credentials = @{
    DEV_ADMIN_USER = 'admin.dev'
    DEV_ADMIN_PASSWORD = (New-DevelopmentPassword)
    DEV_VENDOR_USER = 'vendedor.dev'
    DEV_VENDOR_PASSWORD = (New-DevelopmentPassword)
  }
  foreach ($name in @($credentials.Keys)) {
    if ($environment.ContainsKey($name) -and $environment[$name]) { $credentials[$name] = $environment[$name] }
  }
  $applicationBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $applicationBuilder['Data Source'] = $serverAddress
  $applicationBuilder['Initial Catalog'] = $databaseName
  $applicationBuilder['User ID'] = $applicationLogin
  $applicationBuilder['Password'] = $applicationPassword
  $applicationBuilder['Encrypt'] = $true
  $applicationBuilder['TrustServerCertificate'] = $true
  $applicationBuilder['Connect Timeout'] = 5
  $entries = @{} + $credentials
  $entries['DEV_DB_CONNECTION_STRING'] = $applicationBuilder.ConnectionString
  $entries['EMAIL_ENABLED'] = 'false'
  $entries['EMAIL_USER'] = ''
  $entries['EMAIL_PASSWORD'] = ''
  Save-LocalEnvironment $entries

  if ($databaseExists -eq 0) {
    Invoke-DatabaseCommand $masterConnection 'CREATE DATABASE [ChurritosDev]'
    $connectionBuilder['Initial Catalog'] = $databaseName
    $developmentConnection = New-Object System.Data.SqlClient.SqlConnection($connectionBuilder.ConnectionString)
    $developmentConnection.Open()
    Invoke-DatabaseCommand $developmentConnection "EXEC sys.sp_addextendedproperty @name = N'ChurritosDevelopment', @value = N'1'"
  }
  $tableCount = [int](Invoke-DatabaseCommand $developmentConnection 'SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped = 0' -Scalar)
  if ($tableCount -eq 0) {
    $transaction = $developmentConnection.BeginTransaction()
    try {
      $schema = [System.IO.File]::ReadAllText($schemaPath)
      foreach ($batch in [regex]::Split($schema, '(?im)^\s*GO\s*$')) {
        if ($batch.Trim()) { Invoke-DatabaseCommand $developmentConnection $batch @{} $transaction }
      }
      $transaction.Commit()
    } catch { $transaction.Rollback(); throw } finally { $transaction.Dispose() }
  }

  & (Join-Path $PSScriptRoot 'migrate-dev-db.ps1') -SkipPasswords

  if ($loginExists -eq 0) {
    Invoke-DatabaseCommand $masterConnection @'
DECLARE @statement nvarchar(max) = N'CREATE LOGIN ' + QUOTENAME(@name) + N' WITH PASSWORD = ' + QUOTENAME(@password, '''') + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [ChurritosDev]';
EXEC sys.sp_executesql @statement;
'@ @{ name = $applicationLogin; password = $applicationPassword }
  }
  Invoke-DatabaseCommand $developmentConnection @'
IF USER_ID(N'churritos_dev') IS NULL CREATE USER [churritos_dev] FOR LOGIN [churritos_dev];
IF DATABASE_PRINCIPAL_ID(N'churritos_app') IS NULL CREATE ROLE [churritos_app];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [churritos_app];
IF IS_ROLEMEMBER(N'churritos_app', N'churritos_dev') <> 1 ALTER ROLE [churritos_app] ADD MEMBER [churritos_dev];
'@
  $transaction = $developmentConnection.BeginTransaction()
  try {
    $seed = [System.IO.File]::ReadAllText($seedPath)
    Invoke-DatabaseCommand $developmentConnection $seed @{
      adminUser = $credentials['DEV_ADMIN_USER']; adminPassword = $credentials['DEV_ADMIN_PASSWORD']
      sellerUser = $credentials['DEV_VENDOR_USER']; sellerPassword = $credentials['DEV_VENDOR_PASSWORD']
    } $transaction
    $transaction.Commit()
  } catch { $transaction.Rollback(); throw } finally { $transaction.Dispose() }

  & node (Join-Path $PSScriptRoot 'migrate-passwords.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'Development password migration failed' }

  $applicationConnection = New-Object System.Data.SqlClient.SqlConnection($applicationBuilder.ConnectionString)
  $applicationConnection.Open()
  $isOwner = [int](Invoke-DatabaseCommand $applicationConnection "SELECT IS_ROLEMEMBER('db_owner')" -Scalar)
  if ($isOwner -ne 0) { throw 'The development application login must not be db_owner.' }
  $tableCount = [int](Invoke-DatabaseCommand $applicationConnection 'SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped = 0' -Scalar)
  $clientCount = [int](Invoke-DatabaseCommand $applicationConnection 'SELECT COUNT(*) FROM dbo.Clientes' -Scalar)
  Write-Output "Development database ready: ChurritosDev at 127.0.0.1:1433; $tableCount tables and $clientCount fictitious clients."
  Write-Output 'Application login has data permissions only. Development credentials are saved in .env.development.local.'
  Save-SetupStatus @{ success = $true; database = $databaseName; server = $serverAddress; tables = $tableCount; fictitiousClients = $clientCount; applicationIsDatabaseOwner = ($isOwner -eq 1) }
} catch {
  $errorType = $_.Exception.GetType().Name
  Save-SetupStatus @{ success = $false; state = 'failed'; errorType = $errorType }
  Write-Output "Development setup failed ($errorType). No production connection is used by this script."
  throw
} finally {
  foreach ($connection in @($applicationConnection, $developmentConnection, $masterConnection)) {
    if ($null -ne $connection) { $connection.Dispose() }
  }
}
