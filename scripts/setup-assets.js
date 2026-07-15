const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const faSrc = path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free');
const faDest = path.join(root, 'assets', 'fontawesome');

function copyFontAwesome() {
  if (!fs.existsSync(faSrc)) {
    console.warn('[setup-assets] @fortawesome/fontawesome-free not installed — run npm install');
    return;
  }
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  if (fs.existsSync(faDest)) {
    try { fs.rmSync(faDest, { recursive: true, force: true }); } catch (e) {}
  }
  fs.cpSync(faSrc, faDest, { recursive: true });
  console.log('[setup-assets] Font Awesome copied to assets/fontawesome');
}

function generateIcon() {
  const iconPath = path.join(root, 'icon.png');
  if (fs.existsSync(iconPath)) return;

  if (process.platform === 'win32') {
    const psFile = path.join(root, 'scripts', '_gen-icon.ps1');
    const psContent = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new(256, 256),
  [System.Drawing.Color]::FromArgb(255, 96, 205, 255),
  [System.Drawing.Color]::FromArgb(255, 0, 120, 180)
)
$g.FillRectangle($brush, 0, 0, 256, 256)
$font = New-Object System.Drawing.Font 'Segoe UI', 96, [System.Drawing.FontStyle]::Bold
$g.DrawString('N', $font, [System.Drawing.Brushes]::Black, 72, 58)
$g.Dispose()
$bmp.Save('${iconPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`;
    try {
      fs.writeFileSync(psFile, psContent, 'utf8');
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { stdio: 'pipe' });
      try { fs.unlinkSync(psFile); } catch (e) {}
      if (fs.existsSync(iconPath)) {
        console.log('[setup-assets] icon.png created');
        return;
      }
    } catch (e) {
      console.warn('[setup-assets] PowerShell icon generation failed:', e.message);
    }
  }

  const minimal = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42mNkYGD4z0ABYBw1gGE0DBhGwwAGBgZGDAwMDP8ZGBgYGP4zMDAwMAAAAP//AwBQXQAB0X7xJwAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(iconPath, minimal);
  console.log('[setup-assets] icon.png created (minimal fallback)');
}

copyFontAwesome();
generateIcon();
