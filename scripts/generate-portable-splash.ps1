Add-Type -AssemblyName System.Drawing

function Draw-Glow {
  param(
    [System.Drawing.Graphics] $Graphics,
    [int] $X,
    [int] $Y,
    [int] $Width,
    [int] $Height,
    [System.Drawing.Color] $Color
  )

  $ellipseRect = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddEllipse($ellipseRect)
  $brush = [System.Drawing.Drawing2D.PathGradientBrush]::new($path)
  $brush.CenterColor = $Color
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $Color))
  $Graphics.FillEllipse($brush, $ellipseRect)
  $brush.Dispose()
  $path.Dispose()
}

$width = 620
$height = 360
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
$backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $background,
  [System.Drawing.Color]::FromArgb(255, 7, 11, 21),
  [System.Drawing.Color]::FromArgb(255, 15, 23, 41),
  35
)
$graphics.FillRectangle($backgroundBrush, $background)

Draw-Glow -Graphics $graphics -X -120 -Y -60 -Width 250 -Height 250 -Color ([System.Drawing.Color]::FromArgb(38, 14, 165, 233))
Draw-Glow -Graphics $graphics -X 430 -Y 210 -Width 210 -Height 210 -Color ([System.Drawing.Color]::FromArgb(34, 56, 189, 248))

$centerX = 310
$centerY = 172
$outerPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(44, 125, 211, 252), 1.4)
$innerPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(76, 125, 211, 252), 1.8)
$arcPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(220, 125, 211, 252), 2.4)
$arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$coreGlow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24, 125, 211, 252))
$coreBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 125, 211, 252))

$graphics.FillEllipse($coreGlow, $centerX - 14, $centerY - 14, 28, 28)
$graphics.DrawEllipse($outerPen, $centerX - 22, $centerY - 22, 44, 44)
$graphics.DrawEllipse($innerPen, $centerX - 14, $centerY - 14, 28, 28)
$graphics.DrawArc($arcPen, $centerX - 23, $centerY - 23, 46, 46, 220, 76)
$graphics.FillEllipse($coreBrush, $centerX - 4, $centerY - 4, 8, 8)

$buildDir = Join-Path $PSScriptRoot '..\build'
if (-not (Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

$bmpPath = Join-Path $buildDir 'splash.bmp'
$pngPath = Join-Path $buildDir 'splash-preview.png'

$bitmap.Save($bmpPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$backgroundBrush.Dispose()
$outerPen.Dispose()
$innerPen.Dispose()
$arcPen.Dispose()
$coreGlow.Dispose()
$coreBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()