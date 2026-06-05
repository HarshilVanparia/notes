$lines = Get-Content 'renderer.js'
# Remove the last line (truncated)
$lines = $lines[0..($lines.Count - 2)]
# Verify the last line now ends with a closing brace cleanly
Write-Host "Last line before append:" $lines[-1]
# Read the append content
$append = Get-Content 'renderer-append.js'
Write-Host "Append lines:" $append.Count
# Combine
$final = $lines + $append
$final | Set-Content 'renderer.js'
# Remove the temp file
Remove-Item 'renderer-append.js'
# Verify
$count = (Get-Content 'renderer.js' | Measure-Object -Line).Lines
Write-Host "Final line count:" $count
