Add-Type -AssemblyName System.Drawing

$dark   = [System.Drawing.Color]::FromArgb(255, 21, 23, 28)
$yellow = [System.Drawing.Color]::FromArgb(255, 255, 209, 30)
$black  = [System.Drawing.Color]::FromArgb(255, 0, 0, 0)

function New-RoundedRectPath([single]$x,[single]$y,[single]$w,[single]$h,[single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x,$y,$d,$d,180,90)
  $p.AddArc($x+$w-$d,$y,$d,$d,270,90)
  $p.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90)
  $p.AddArc($x,$y+$h-$d,$d,$d,90,90)
  $p.CloseFigure()
  return $p
}

function Get-MarkPaths([int]$size,[single]$scale) {
  $bw = $size * $scale; $bh = $bw
  $bx = ($size - $bw)/2; $by = ($size - $bh)/2 - $size*0.02
  $r = $bw*0.28
  $bubble = New-RoundedRectPath $bx $by $bw $bh $r
  $tail = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tx=$bx+$bw*0.22; $ty=$by+$bh*0.92
  $tail.AddPolygon(@(
    (New-Object System.Drawing.PointF($tx,$ty)),
    (New-Object System.Drawing.PointF(($tx+$bw*0.18),$ty)),
    (New-Object System.Drawing.PointF(($bx+$bw*0.06),($by+$bh*1.14)))
  ))
  $norm=@(@(0.60,0.16),@(0.34,0.54),@(0.50,0.54),@(0.42,0.86),@(0.70,0.44),@(0.54,0.44))
  $bpts = foreach($n in $norm){ New-Object System.Drawing.PointF(($bx+$bw*$n[0]),($by+$bh*$n[1])) }
  $bolt = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bolt.AddPolygon([System.Drawing.PointF[]]$bpts)
  return @{ bubble=$bubble; tail=$tail; bolt=$bolt }
}

# kind: "legacy" (dark bg + yellow bubble + dark bolt), "fg" (transparent + mark),
#       "bg" (solid dark), "mono" (transparent, bubble-minus-bolt in black)
function Save-Icon([string]$path,[int]$size,[string]$kind,[single]$scale) {
  $bmp = New-Object System.Drawing.Bitmap($size,$size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if ($kind -eq "bg") {
    $g.Clear($dark)
  } elseif ($kind -eq "legacy") {
    $g.Clear($dark)
    $m = Get-MarkPaths $size $scale
    $g.FillPath((New-Object System.Drawing.SolidBrush($yellow)), $m.bubble)
    $g.FillPath((New-Object System.Drawing.SolidBrush($yellow)), $m.tail)
    $g.FillPath((New-Object System.Drawing.SolidBrush($dark)), $m.bolt)
  } elseif ($kind -eq "mono") {
    $g.Clear([System.Drawing.Color]::Transparent)
    $m = Get-MarkPaths $size $scale
    $region = New-Object System.Drawing.Region($m.bubble)
    $region.Union($m.tail)
    $region.Exclude($m.bolt)
    $g.FillRegion((New-Object System.Drawing.SolidBrush($black)), $region)
  } else { # fg
    $g.Clear([System.Drawing.Color]::Transparent)
    $m = Get-MarkPaths $size $scale
    $g.FillPath((New-Object System.Drawing.SolidBrush($yellow)), $m.bubble)
    $g.FillPath((New-Object System.Drawing.SolidBrush($yellow)), $m.tail)
    $g.FillPath((New-Object System.Drawing.SolidBrush($dark)), $m.bolt)
  }
  $g.Dispose()
  $bmp.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$res = "C:\dev\zapp\app\android\app\src\main\res"
$legacy   = @{ mdpi=48; hdpi=72; xhdpi=96; xxhdpi=144; xxxhdpi=192 }
$adaptive = @{ mdpi=108; hdpi=162; xhdpi=216; xxhdpi=324; xxxhdpi=432 }

foreach ($d in $legacy.Keys) {
  $dir = Join-Path $res "mipmap-$d"
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Filter *.webp | Remove-Item -Force -ErrorAction SilentlyContinue
  Save-Icon "$dir\ic_launcher.png"            $legacy[$d]   "legacy" 0.64
  Save-Icon "$dir\ic_launcher_round.png"      $legacy[$d]   "legacy" 0.64
  Save-Icon "$dir\ic_launcher_foreground.png" $adaptive[$d] "fg"     0.58
  Save-Icon "$dir\ic_launcher_background.png" $adaptive[$d] "bg"     1.0
  Save-Icon "$dir\ic_launcher_monochrome.png" $adaptive[$d] "mono"   0.58
  Write-Host "rebuilt mipmap-$d"
}
Write-Host "DONE"
