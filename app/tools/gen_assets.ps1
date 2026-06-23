Add-Type -AssemblyName System.Drawing

# Brand colors
$dark   = [System.Drawing.Color]::FromArgb(255, 21, 23, 28)    # #15171C
$yellow = [System.Drawing.Color]::FromArgb(255, 255, 209, 30)  # #FFD11E

function New-RoundedRectPath([single]$x,[single]$y,[single]$w,[single]$h,[single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Draws the bolt-in-bubble mark centered on a canvas of given size.
# scale = fraction of canvas the bubble occupies.
function Draw-Mark([System.Drawing.Graphics]$g, [int]$size, [single]$scale, $bubbleColor, $boltColor) {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $bw = $size * $scale
  $bh = $bw
  $bx = ($size - $bw) / 2
  $by = ($size - $bh) / 2 - $size * 0.02
  $r  = $bw * 0.28

  $bubble = New-RoundedRectPath $bx $by $bw $bh $r
  $brush = New-Object System.Drawing.SolidBrush($bubbleColor)
  $g.FillPath($brush, $bubble)

  # Chat tail (bottom-left triangle)
  $tail = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tx = $bx + $bw * 0.22
  $ty = $by + $bh * 0.92
  $pts = @(
    (New-Object System.Drawing.PointF($tx, $ty)),
    (New-Object System.Drawing.PointF(($tx + $bw * 0.18), $ty)),
    (New-Object System.Drawing.PointF(($bx + $bw * 0.06), ($by + $bh * 1.14)))
  )
  $tail.AddPolygon($pts)
  $g.FillPath($brush, $tail)

  # Lightning bolt (normalized points inside the bubble box)
  $norm = @(
    @(0.60,0.16),@(0.34,0.54),@(0.50,0.54),@(0.42,0.86),@(0.70,0.44),@(0.54,0.44)
  )
  $bpts = foreach ($n in $norm) {
    New-Object System.Drawing.PointF(($bx + $bw * $n[0]), ($by + $bh * $n[1]))
  }
  $boltPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $boltPath.AddPolygon([System.Drawing.PointF[]]$bpts)
  $boltBrush = New-Object System.Drawing.SolidBrush($boltColor)
  $g.FillPath($boltBrush, $boltPath)
}

function Save-Png([string]$path, [int]$size, [bool]$darkBg, [single]$scale) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  if ($darkBg) {
    $g.Clear($dark)
    Draw-Mark $g $size $scale $yellow $dark
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
    Draw-Mark $g $size $scale $yellow $dark
  }
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $path"
}

$assets = "C:\dev\zapp\app\assets"

# App icon (full dark bg) + adaptive foreground (transparent, padded) + splash + in-app logo
Save-Png "$assets\icon.png"          1024 $true  0.64
Save-Png "$assets\adaptive-icon.png" 1024 $false 0.62
Save-Png "$assets\splash-icon.png"   512  $false 0.80
Save-Png "$assets\logo.png"          512  $false 0.82
Save-Png "$assets\favicon.png"       48   $true  0.70

Write-Host "DONE"
