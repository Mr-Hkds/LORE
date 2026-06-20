try {
    $json = Get-Content 'public\content\stories.json' -Raw | ConvertFrom-Json
    $stories = $json.stories
    Write-Host "Valid JSON - $($stories.Count) stories found"
    
    foreach ($s in $stories) {
        Write-Host ""
        Write-Host "STORY: $($s.story_id) - $($s.title)"
        Write-Host "  Category: $($s.category) | Severity: $($s.severity)"
        Write-Host "  Layers: $($s.layers.Count) | Connections: $($s.connections.Count)"
        Write-Host "  Concepts: $($s.concepts -join ', ')"
        foreach ($l in $s.layers) {
            $wc = ($l.content -split '\s+').Count
            $ch = if ($l.cliffhanger) { "YES" } else { "null" }
            Write-Host "  L$($l.layer): $($l.layer_name) [$wc words] cliff=$ch"
        }
    }

    # Validate concept index
    $ci = Get-Content 'public\content\concept_index.json' -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "Concept index: Valid JSON"
    $ci.PSObject.Properties | ForEach-Object {
        Write-Host "  $($_.Name): $($_.Value -join ', ')"
    }
} catch {
    Write-Host "INVALID JSON: $_"
}
