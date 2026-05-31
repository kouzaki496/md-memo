param(
  [string]$InputPath = "src-tauri/app-icon.png",
  [string]$OutputPath = "src-tauri/app-icon.png",
  [int]$CornerRadius = 0,
  [int]$BlackThreshold = 28
)

Add-Type -AssemblyName System.Drawing

function Test-RoundedRect {
  param([int]$X, [int]$Y, [int]$Width, [int]$Height, [int]$Radius)
  $r = $Radius
  $r2 = $r * $r
  if ($X -ge $r -and $X -lt ($Width - $r)) { return $true }
  if ($Y -ge $r -and $Y -lt ($Height - $r)) { return $true }

  if ($X -lt $r -and $Y -lt $r) {
    $dx = $r - $X; $dy = $r - $Y
    return (($dx * $dx + $dy * $dy) -le $r2)
  }
  if ($X -ge ($Width - $r) -and $Y -lt $r) {
    $dx = $X - ($Width - $r - 1); $dy = $r - $Y
    return (($dx * $dx + $dy * $dy) -le $r2)
  }
  if ($X -lt $r -and $Y -ge ($Height - $r)) {
    $dx = $r - $X; $dy = $Y - ($Height - $r - 1)
    return (($dx * $dx + $dy * $dy) -le $r2)
  }
  if ($X -ge ($Width - $r) -and $Y -ge ($Height - $r)) {
    $dx = $X - ($Width - $r - 1); $dy = $Y - ($Height - $r - 1)
    return (($dx * $dx + $dy * $dy) -le $r2)
  }
  return $false
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$inFile = Join-Path $root $InputPath
$outFile = Join-Path $root $OutputPath
$tmpFile = "$outFile.tmp.png"

$src = [System.Drawing.Bitmap]::FromFile($inFile)
$w = $src.Width
$h = $src.Height
if ($CornerRadius -le 0) {
  $CornerRadius = [int][Math]::Round($w * 0.2237)
}

$out = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.Clear([System.Drawing.Color]::Transparent)

for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $src.GetPixel($x, $y)
    $inside = Test-RoundedRect -X $x -Y $y -Width $w -Height $h -Radius $CornerRadius
    $isBlack = ($c.R -le $BlackThreshold -and $c.G -le $BlackThreshold -and $c.B -le $BlackThreshold)

    if (-not $inside -or $isBlack) {
      continue
    }

    $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
  }
}

$out.Save($tmpFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$out.Dispose()
$src.Dispose()

Move-Item -Force $tmpFile $outFile

Write-Output "Wrote transparent icon: $outFile (radius=$CornerRadius)"
