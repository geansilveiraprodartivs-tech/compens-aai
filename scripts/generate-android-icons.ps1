param(
  [string]$Source
)

Add-Type -AssemblyName System.Drawing

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Source) { $Source = Join-Path $repoRoot 'resources\app-icon.png' }
$resDir = Join-Path $repoRoot 'android\app\src\main\res'

if (-not (Test-Path -LiteralPath $resDir)) {
  throw "Android res dir not found: $resDir. Run 'npx cap add android' first."
}
if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source icon not found: $Source"
}

$src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
$bmp = New-Object System.Drawing.Bitmap $src

$corners = @(@(0, 0), @(($bmp.Width - 1), 0), @(0, ($bmp.Height - 1)), @(($bmp.Width - 1), ($bmp.Height - 1)))
$r = 0; $g = 0; $b = 0
foreach ($p in $corners) { $c = $bmp.GetPixel($p[0], $p[1]); $r += $c.R; $g += $c.G; $b += $c.B }
$hex = '#{0:X2}{1:X2}{2:X2}' -f [int]($r / 4), [int]($g / 4), [int]($b / 4)

function Save-Resized($image, $w, $h, $path) {
  $dst = New-Object System.Drawing.Bitmap $w, $h
  $gr = [System.Drawing.Graphics]::FromImage($dst)
  $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $gr.DrawImage($image, $rect)
  $gr.Dispose()
  $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
}

$densities = [ordered]@{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($name in $densities.Keys) {
  $size = $densities[$name]
  $fg = [int]($size * 108 / 48)
  $dir = Join-Path $resDir "mipmap-$name"
  Save-Resized $bmp $size $size (Join-Path $dir 'ic_launcher.png')
  Save-Resized $bmp $size $size (Join-Path $dir 'ic_launcher_round.png')
  Save-Resized $bmp $fg $fg (Join-Path $dir 'ic_launcher_foreground.png')
}

$bgXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$hex</color>
</resources>
"@

$bgPath = Join-Path $resDir 'values\ic_launcher_background.xml'
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($bgPath, ($bgXml + "`n"), $enc)

$src.Dispose()
$bmp.Dispose()

Write-Output "Icons generated. Adaptive background set to $hex."
