param([switch]$SkipPasswords)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$connection = New-Object System.Data.SqlClient.SqlConnection('Data Source=lpc:.\SQLEXPRESS;Initial Catalog=ChurritosDev;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;Connect Timeout=8')
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = "IF DB_NAME()<>N'ChurritosDev' OR CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName'))<>N'SQLEXPRESS' THROW 51000,'Development database required',1; IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name='ChurritosDevelopment' AND CONVERT(nvarchar(10),value)='1') THROW 51000,'Development marker required',1; IF OBJECT_ID('dbo.Schema_Migration') IS NULL CREATE TABLE dbo.Schema_Migration(nombre varchar(150) PRIMARY KEY,fecha datetime2 NOT NULL DEFAULT SYSUTCDATETIME());"
  [void]$command.ExecuteNonQuery()
  foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $root 'database/migrations') -Filter '*.sql' | Sort-Object Name)) {
    $command.CommandText = 'SELECT COUNT(*) FROM dbo.Schema_Migration WHERE nombre=@name'
    $command.Parameters.Clear()
    [void]$command.Parameters.AddWithValue('@name', $file.Name)
    if ([int]$command.ExecuteScalar() -gt 0) { continue }
    $transaction = $connection.BeginTransaction()
    try {
      $command.Transaction = $transaction
      $command.Parameters.Clear()
      $command.CommandTimeout = 60
      foreach ($batch in [regex]::Split([IO.File]::ReadAllText($file.FullName), '(?im)^\s*GO\s*$')) {
        if ($batch.Trim()) { $command.CommandText = $batch; [void]$command.ExecuteNonQuery() }
      }
      $command.CommandText = 'INSERT dbo.Schema_Migration(nombre) VALUES(@name)'
      [void]$command.Parameters.AddWithValue('@name', $file.Name)
      [void]$command.ExecuteNonQuery()
      $transaction.Commit()
      Write-Output ('Development migration applied: ' + $file.Name)
    } catch { $transaction.Rollback(); throw } finally { $command.Transaction = $null; $transaction.Dispose() }
  }
} finally { $connection.Dispose() }
if (-not $SkipPasswords) {
  & node (Join-Path $PSScriptRoot 'migrate-passwords.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'Password migration failed' }
}
