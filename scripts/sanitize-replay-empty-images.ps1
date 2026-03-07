param(
  [Parameter(Mandatory = $false)]
  [string[]]$Paths = @("C:\Users\Coca-Cola\.codex\sessions"),

  [Parameter(Mandatory = $false)]
  [string]$ExcludeRegex = '\\node_modules\\|\\\.next\\|\\dist\\|\\build\\|\\playwright-report\\|\\reports\\|\\test-results\\|\\Cache\\|\\GPUCache\\|\\Code Cache\\',

  [Parameter(Mandatory = $false)]
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:RemoveMarker = [pscustomobject]@{ __remove__ = $true }
$script:CurrentFileChanged = $false

function Test-EmptyImageDataUrl {
  param(
    [Parameter(Mandatory = $false)]
    [object]$Value
  )

  if ($null -eq $Value -or $Value -isnot [string]) { return $false }
  return [bool]($Value -match '^data:image/[A-Za-z0-9.+-]+;base64,\s*$')
}

function Get-PropValue {
  param(
    [Parameter(Mandatory = $true)] [object]$Obj,
    [Parameter(Mandatory = $true)] [string]$Name
  )

  if ($Obj -is [System.Collections.IDictionary]) {
    if ($Obj.Contains($Name)) { return $Obj[$Name] }
    return $null
  }

  $prop = $Obj.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
}

function Set-PropValue {
  param(
    [Parameter(Mandatory = $true)] [object]$Obj,
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $false)] [object]$Value
  )

  if ($Obj -is [System.Collections.IDictionary]) {
    $Obj[$Name] = $Value
    return
  }

  $prop = $Obj.PSObject.Properties[$Name]
  if ($null -ne $prop) {
    $Obj.$Name = $Value
  }
}

function Test-IsObjectLike {
  param(
    [Parameter(Mandatory = $false)]
    [object]$Node
  )

  if ($null -eq $Node) { return $false }
  if ($Node -is [string]) { return $false }
  if ($Node -is [ValueType]) { return $false }
  if ($Node -is [System.Collections.IDictionary]) { return $true }
  return $Node.PSObject.Properties.Count -gt 0
}

function Sanitize-Node {
  param(
    [Parameter(Mandatory = $false)]
    [object]$Node
  )

  if ($null -eq $Node) { return $null }

  if ($Node -is [System.Collections.IList]) {
    $sanitizedList = New-Object System.Collections.ArrayList
    foreach ($item in $Node) {
      $sanitizedItem = Sanitize-Node -Node $item
      if ($sanitizedItem -eq $script:RemoveMarker) {
        $script:CurrentFileChanged = $true
        continue
      }
      [void]$sanitizedList.Add($sanitizedItem)
    }
    return ,([object[]]$sanitizedList)
  }

  if (Test-IsObjectLike -Node $Node) {
    $typeValue = Get-PropValue -Obj $Node -Name "type"

    if ($typeValue -eq "input_image") {
      $imageUrl = Get-PropValue -Obj $Node -Name "image_url"
      if (Test-EmptyImageDataUrl -Value $imageUrl) {
        $script:CurrentFileChanged = $true
        return $script:RemoveMarker
      }
    }

    if ($typeValue -eq "image_url") {
      $imageUrlValue = Get-PropValue -Obj $Node -Name "image_url"
      if (Test-EmptyImageDataUrl -Value $imageUrlValue) {
        $script:CurrentFileChanged = $true
        return $script:RemoveMarker
      }

      if (Test-IsObjectLike -Node $imageUrlValue) {
        $nestedUrl = Get-PropValue -Obj $imageUrlValue -Name "url"
        if (Test-EmptyImageDataUrl -Value $nestedUrl) {
          $script:CurrentFileChanged = $true
          return $script:RemoveMarker
        }
      }
    }

    $propertyNames = @()
    if ($Node -is [System.Collections.IDictionary]) {
      $propertyNames = @($Node.Keys)
    } else {
      $propertyNames = @($Node.PSObject.Properties.Name)
    }

    foreach ($name in $propertyNames) {
      $currentValue = Get-PropValue -Obj $Node -Name $name
      $sanitizedValue = Sanitize-Node -Node $currentValue
      if ($sanitizedValue -eq $script:RemoveMarker) {
        Set-PropValue -Obj $Node -Name $name -Value $null
        continue
      }
      Set-PropValue -Obj $Node -Name $name -Value $sanitizedValue
    }
  }

  return $Node
}

function Sanitize-JsonFile {
  param(
    [Parameter(Mandatory = $true)] [string]$FilePath,
    [Parameter(Mandatory = $false)] [switch]$DryRunMode
  )

  $extension = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
  $changed = $false
  $itemsChanged = 0

  if ($extension -eq ".jsonl") {
    $lines = Get-Content -Path $FilePath
    $newLines = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
      if ([string]::IsNullOrWhiteSpace($line)) {
        [void]$newLines.Add($line)
        continue
      }

      try {
        $obj = $line | ConvertFrom-Json -Depth 100
      } catch {
        [void]$newLines.Add($line)
        continue
      }

      $script:CurrentFileChanged = $false
      $sanitizedObj = Sanitize-Node -Node $obj

      if ($script:CurrentFileChanged) {
        $changed = $true
        $itemsChanged++
        [void]$newLines.Add(($sanitizedObj | ConvertTo-Json -Depth 100 -Compress))
      } else {
        [void]$newLines.Add($line)
      }
    }

    if ($changed -and -not $DryRunMode) {
      Copy-Item -Path $FilePath -Destination ($FilePath + ".bak") -Force
      Set-Content -Path $FilePath -Value $newLines -Encoding UTF8
    }

    return [pscustomobject]@{
      File = $FilePath
      Changed = $changed
      ItemsChanged = $itemsChanged
    }
  }

  if ($extension -eq ".json") {
    try {
      $jsonText = Get-Content -Path $FilePath -Raw
      $obj = $jsonText | ConvertFrom-Json -Depth 100
    } catch {
      return [pscustomobject]@{
        File = $FilePath
        Changed = $false
        ItemsChanged = 0
      }
    }

    $script:CurrentFileChanged = $false
    $sanitizedObj = Sanitize-Node -Node $obj

    if ($script:CurrentFileChanged) {
      $changed = $true
      $itemsChanged = 1
      if (-not $DryRunMode) {
        Copy-Item -Path $FilePath -Destination ($FilePath + ".bak") -Force
        Set-Content -Path $FilePath -Value ($sanitizedObj | ConvertTo-Json -Depth 100) -Encoding UTF8
      }
    }

    return [pscustomobject]@{
      File = $FilePath
      Changed = $changed
      ItemsChanged = $itemsChanged
    }
  }

  return [pscustomobject]@{
    File = $FilePath
    Changed = $false
    ItemsChanged = 0
  }
}

$allFiles = New-Object System.Collections.Generic.List[string]
foreach ($path in $Paths) {
  if (-not (Test-Path -Path $path)) { continue }

  if ((Get-Item -Path $path).PSIsContainer) {
    Get-ChildItem -Path $path -Recurse -File -Include *.json, *.jsonl -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.FullName -match $ExcludeRegex) { return }
      [void]$allFiles.Add($_.FullName)
    }
  } else {
    $resolved = (Resolve-Path $path).Path
    if ($resolved -notmatch $ExcludeRegex) {
      [void]$allFiles.Add($resolved)
    }
  }
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($file in $allFiles) {
  try {
    $result = Sanitize-JsonFile -FilePath $file -DryRunMode:$DryRun
    [void]$results.Add($result)
  } catch {
    [void]$results.Add([pscustomobject]@{
      File = $file
      Changed = $false
      ItemsChanged = 0
      Error = $_.Exception.Message
    })
  }
}

$changedFiles = @($results | Where-Object { $_.Changed -eq $true })
$totalItems = 0
if ($changedFiles.Count -gt 0) {
  $measure = $changedFiles | Measure-Object -Property ItemsChanged -Sum
  if ($null -ne $measure -and $null -ne $measure.Sum) {
    $totalItems = [int]$measure.Sum
  }
}

Write-Output ("Scanned files: {0}" -f $results.Count)
Write-Output ("Changed files: {0}" -f $changedFiles.Count)
Write-Output ("Removed empty image items: {0}" -f $totalItems)

if ($changedFiles.Count -gt 0) {
  Write-Output ""
  Write-Output "Changed:"
  $changedFiles | Select-Object File, ItemsChanged | Format-Table -AutoSize | Out-String | Write-Output
}

if ($DryRun) {
  Write-Output "Dry run only. No file was modified."
}
