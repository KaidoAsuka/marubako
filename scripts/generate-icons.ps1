# Regenerates the Marubako application icon files from their SVG sources.
#
#   src/renderer/src/assets/marubako.svg        main art, used from 32 px up (also the title bar and splash image)
#   src/renderer/src/assets/marubako-small.svg  same shape on a fuller canvas with a bigger dot, used for 16, 20 and 24 px
#
# Outputs (names are referenced by tray.ts, window-manager.ts and electron-builder.config.cjs):
#   resources/icons/marubako-<size>.png     for 16, 20, 24, 32, 40, 48, 64, 128 and 256 px
#   resources/icons/icon.ico, icon-256.ico  multi-size icons holding the same nine PNG frames
#
# The art is one gradient-filled path (M, L, H, V, circular A and Z commands only) plus one circle. Both are read from
# the SVG files, drawn with GDI+ at 8x the target size, and box-filtered down so that edges are anti-aliased and the
# corners stay truly transparent. Any other SVG element or path command stops the script instead of rendering wrongly.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('MarubakoIconResampler' -as [type])) {
    Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class MarubakoIconResampler
{
    // Averages factor x factor blocks of a straight-alpha ARGB bitmap, weighting colours by alpha (premultiplied
    // averaging), so a half-covered edge pixel keeps the art colour and only its alpha drops.
    public static Bitmap Downsample(Bitmap source, int factor)
    {
        int width = source.Width / factor;
        int height = source.Height / factor;
        BitmapData input = source.LockBits(new Rectangle(0, 0, source.Width, source.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] pixels = new byte[input.Stride * source.Height];
        Marshal.Copy(input.Scan0, pixels, 0, pixels.Length);
        int inputStride = input.Stride;
        source.UnlockBits(input);

        Bitmap result = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        BitmapData output = result.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] target = new byte[output.Stride * height];
        int blockSize = factor * factor;
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                long alphaSum = 0, blueSum = 0, greenSum = 0, redSum = 0;
                for (int sy = 0; sy < factor; sy++)
                {
                    int index = (y * factor + sy) * inputStride + x * factor * 4;
                    for (int sx = 0; sx < factor; sx++, index += 4)
                    {
                        int alpha = pixels[index + 3];
                        alphaSum += alpha;
                        blueSum += pixels[index] * alpha;
                        greenSum += pixels[index + 1] * alpha;
                        redSum += pixels[index + 2] * alpha;
                    }
                }
                if (alphaSum == 0) continue;
                int offset = y * output.Stride + x * 4;
                target[offset] = (byte)((blueSum + alphaSum / 2) / alphaSum);
                target[offset + 1] = (byte)((greenSum + alphaSum / 2) / alphaSum);
                target[offset + 2] = (byte)((redSum + alphaSum / 2) / alphaSum);
                target[offset + 3] = (byte)((alphaSum + blockSize / 2) / blockSize);
            }
        }
        Marshal.Copy(target, 0, output.Scan0, target.Length);
        result.UnlockBits(output);
        return result;
    }
}
'@
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$iconDirectory = Join-Path $repoRoot 'resources/icons'
[void][System.IO.Directory]::CreateDirectory($iconDirectory)

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$smallArtMaxSize = 24
$supersample = 8

# Builds a GraphicsPath (in viewBox units) from an SVG path string. Only absolute M, L, H, V, A (circular, no rotation) and Z.
function ConvertTo-GraphicsPath([string] $data) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $tokens = @([regex]::Matches($data, '[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?') | ForEach-Object { $_.Value })
    $index = 0
    $command = ''
    $x = 0.0; $y = 0.0; $startX = 0.0; $startY = 0.0
    while ($index -lt $tokens.Count) {
        if ($tokens[$index] -match '^[A-Za-z]$') { $command = $tokens[$index]; $index++ }
        elseif ($command -eq '') { throw "SVG path data does not start with a command: $data" }
        switch -CaseSensitive ($command) {
            'M' {
                $x = [double]$tokens[$index]; $y = [double]$tokens[$index + 1]; $index += 2
                $path.StartFigure(); $startX = $x; $startY = $y; $command = 'L'
            }
            'L' {
                $nextX = [double]$tokens[$index]; $nextY = [double]$tokens[$index + 1]; $index += 2
                $path.AddLine([single]$x, [single]$y, [single]$nextX, [single]$nextY); $x = $nextX; $y = $nextY
            }
            'H' {
                $nextX = [double]$tokens[$index]; $index++
                $path.AddLine([single]$x, [single]$y, [single]$nextX, [single]$y); $x = $nextX
            }
            'V' {
                $nextY = [double]$tokens[$index]; $index++
                $path.AddLine([single]$x, [single]$y, [single]$x, [single]$nextY); $y = $nextY
            }
            'A' {
                $radius = [double]$tokens[$index]
                if ([double]$tokens[$index + 1] -ne $radius -or [double]$tokens[$index + 2] -ne 0) { throw 'Only circular arcs without rotation are supported.' }
                $largeArc = [int]$tokens[$index + 3]; $sweep = [int]$tokens[$index + 4]
                $endX = [double]$tokens[$index + 5]; $endY = [double]$tokens[$index + 6]; $index += 7
                # Endpoint to centre parameterisation (SVG 1.1 implementation notes F.6.5, no rotation).
                $halfX = ($x - $endX) / 2; $halfY = ($y - $endY) / 2
                $distanceSquared = $halfX * $halfX + $halfY * $halfY
                if ($radius * $radius -lt $distanceSquared) { $radius = [Math]::Sqrt($distanceSquared) }
                $factor = [Math]::Sqrt([Math]::Max(0.0, ($radius * $radius - $distanceSquared) / $distanceSquared))
                if ($largeArc -eq $sweep) { $factor = -$factor }
                $centerOffsetX = $factor * $halfY; $centerOffsetY = -$factor * $halfX
                $centerX = $centerOffsetX + ($x + $endX) / 2; $centerY = $centerOffsetY + ($y + $endY) / 2
                $startAngle = [Math]::Atan2($halfY - $centerOffsetY, $halfX - $centerOffsetX)
                $endAngle = [Math]::Atan2(-$halfY - $centerOffsetY, -$halfX - $centerOffsetX)
                $sweepAngle = $endAngle - $startAngle
                if ($sweep -eq 0 -and $sweepAngle -gt 0) { $sweepAngle -= 2 * [Math]::PI }
                if ($sweep -eq 1 -and $sweepAngle -lt 0) { $sweepAngle += 2 * [Math]::PI }
                # GDI+ measures angles clockwise from the +x axis in a y-down space, the same direction as SVG's sweep flag 1.
                $path.AddArc([single]($centerX - $radius), [single]($centerY - $radius), [single](2 * $radius), [single](2 * $radius), [single]($startAngle * 180 / [Math]::PI), [single]($sweepAngle * 180 / [Math]::PI))
                $x = $endX; $y = $endY
            }
            'Z' { $path.CloseFigure(); $x = $startX; $y = $startY }
            default { throw "Unsupported SVG path command '$command'." }
        }
    }
    return $path
}

# Reads one icon SVG: viewBox, the gradient, the filled path and the dot.
function Read-IconArt([string] $svgPath) {
    $document = [System.Xml.XmlDocument]::new()
    $document.Load($svgPath)
    $root = $document.DocumentElement
    $viewBox = @($root.GetAttribute('viewBox').Split(' ') | ForEach-Object { [double]$_ })
    if ($viewBox.Count -ne 4 -or $viewBox[0] -ne 0 -or $viewBox[1] -ne 0 -or $viewBox[2] -ne $viewBox[3]) { throw "$svgPath needs a square viewBox starting at 0 0." }
    $gradient = $root.SelectSingleNode("//*[local-name()='linearGradient']")
    $stops = @($gradient.SelectNodes("*[local-name()='stop']"))
    if ($gradient.GetAttribute('gradientUnits') -ne 'userSpaceOnUse' -or $stops.Count -ne 2 -or [double]$stops[0].GetAttribute('offset') -ne 0 -or [double]$stops[1].GetAttribute('offset') -ne 1) {
        throw "$svgPath needs a two-stop userSpaceOnUse gradient with offsets 0 and 1."
    }
    $shape = $root.SelectSingleNode("//*[local-name()='path']")
    if ($shape.GetAttribute('fill') -ne "url(#$($gradient.GetAttribute('id')))") { throw "$svgPath path must be filled with its gradient." }
    $dot = $root.SelectSingleNode("//*[local-name()='circle']")
    $extra = $root.SelectNodes("//*[local-name()!='svg' and local-name()!='defs' and local-name()!='linearGradient' and local-name()!='stop' and local-name()!='path' and local-name()!='circle']")
    if ($extra.Count -gt 0) { throw "$svgPath contains unsupported element <$($extra[0].LocalName)>." }
    return @{
        ViewBox = $viewBox[2]
        Start = [System.Drawing.PointF]::new([single][double]$gradient.GetAttribute('x1'), [single][double]$gradient.GetAttribute('y1'))
        End = [System.Drawing.PointF]::new([single][double]$gradient.GetAttribute('x2'), [single][double]$gradient.GetAttribute('y2'))
        StartColor = [System.Drawing.ColorTranslator]::FromHtml($stops[0].GetAttribute('stop-color'))
        EndColor = [System.Drawing.ColorTranslator]::FromHtml($stops[1].GetAttribute('stop-color'))
        Path = ConvertTo-GraphicsPath $shape.GetAttribute('d')
        DotX = [double]$dot.GetAttribute('cx'); DotY = [double]$dot.GetAttribute('cy'); DotRadius = [double]$dot.GetAttribute('r')
        DotColor = [System.Drawing.ColorTranslator]::FromHtml($dot.GetAttribute('fill'))
    }
}

function New-IconBitmap($art, [int] $size) {
    $canvasSize = $size * $supersample
    $canvas = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new($art.Start, $art.End, $art.StartColor, $art.EndColor)
    $dotBrush = [System.Drawing.SolidBrush]::new($art.DotColor)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $graphics.ScaleTransform($canvasSize / $art.ViewBox, $canvasSize / $art.ViewBox)
        $graphics.FillPath($gradient, $art.Path)
        $graphics.FillEllipse($dotBrush, [single]($art.DotX - $art.DotRadius), [single]($art.DotY - $art.DotRadius), [single](2 * $art.DotRadius), [single](2 * $art.DotRadius))
        return [MarubakoIconResampler]::Downsample($canvas, $supersample)
    } finally {
        $dotBrush.Dispose(); $gradient.Dispose(); $graphics.Dispose(); $canvas.Dispose()
    }
}

$assetDirectory = Join-Path $repoRoot 'src/renderer/src/assets'
$mainArt = Read-IconArt (Join-Path $assetDirectory 'marubako.svg')
$smallArt = Read-IconArt (Join-Path $assetDirectory 'marubako-small.svg')

$frames = @()
foreach ($size in $sizes) {
    $art = if ($size -le $smallArtMaxSize) { $smallArt } else { $mainArt }
    $bitmap = New-IconBitmap $art $size
    $stream = [System.IO.MemoryStream]::new()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    [System.IO.File]::WriteAllBytes((Join-Path $iconDirectory "marubako-$size.png"), $bytes)
    $frames += @{ Size = $size; Bytes = $bytes }
    $stream.Dispose(); $bitmap.Dispose()
}
$mainArt.Path.Dispose(); $smallArt.Path.Dispose()

# ICO container with PNG-compressed frames; a 256 px frame is stored as 0 in the directory.
foreach ($fileName in @('icon.ico', 'icon-256.ico')) {
    $output = [System.IO.File]::Create((Join-Path $iconDirectory $fileName))
    $writer = [System.IO.BinaryWriter]::new($output)
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
        $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
    $writer.Dispose(); $output.Dispose()
}
Write-Output "Generated Marubako icons: $($sizes -join ', ') px"
