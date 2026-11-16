$ErrorActionPreference = 'Stop'

$outputDir = 'C:\Chat Relay\public'

function Get-WordClass {
  param(
    [string]$Text,
    [int]$Index
  )

  if ($Text.Length -gt 11 -or $Text.Contains(' ')) { return 'tiny' }
  if ($Text.Length -gt 8) { return 'small' }
  if ($Index -eq 3) { return 'tiny' }
  return 'big'
}

function New-DomainMarkup {
  param(
    [string]$DomainHost,
    [string]$Logo
  )

  $parts = $DomainHost.Split('.', 2)
  $hostLabel = $parts[0].ToUpperInvariant().ToCharArray()
  $tld = if ($parts.Count -gt 1) { $parts[1].ToUpperInvariant().ToCharArray() } else { @() }

  $lines = @()
  $lines += "      <div class=`"ad-logo-row`"><img src=`"$Logo`" alt=`"`"></div>"
  $lines += "      <div class=`"v-letter www`">W</div>"
  $lines += "      <div class=`"v-letter www`">W</div>"
  $lines += "      <div class=`"v-letter www`">W</div>"
  $lines += "      <div class=`"v-letter dot`">.</div>"

  foreach ($ch in $hostLabel) {
    $lines += "      <div class=`"v-letter`">$ch</div>"
  }

  if ($tld.Count -gt 0) {
    $lines += "      <div class=`"v-letter dot`">.</div>"
    foreach ($ch in $tld) {
      $lines += "      <div class=`"v-letter tld`">$ch</div>"
    }
  }

  return ($lines -join "`r`n")
}

function New-WordSectionMarkup {
  param(
    [string[]]$Words
  )

  $lines = @()
  for ($i = 0; $i -lt $Words.Count; $i++) {
    $class = Get-WordClass -Text $Words[$i] -Index $i
    $tone = 'tone' + (($i % 4) + 1)
    $lines += "      <div class=`"v-word $class $tone`">$($Words[$i])</div>"
  }

  return ($lines -join "`r`n")
}

function New-SetMarkup {
  param(
    [hashtable]$Game
  )

  $domainMarkup = New-DomainMarkup -DomainHost $Game.Host -Logo $Game.Logo
  $section1 = New-WordSectionMarkup -Words $Game.Section1
  $section2 = New-WordSectionMarkup -Words $Game.Section2
  $section3 = New-WordSectionMarkup -Words $Game.Section3

  return @"
    <div style="background:linear-gradient(180deg, $($Game.Bg1), $($Game.Bg2))">
$domainMarkup
    </div>

    <div class="spacer" style="background:linear-gradient(180deg, $($Game.Bg2), $($Game.Bg3))"></div>

    <div style="background:linear-gradient(180deg, $($Game.Bg3), $($Game.Bg4))">
$section1
    </div>

    <div class="spacer" style="background:linear-gradient(180deg, $($Game.Bg4), $($Game.Bg1))"></div>

    <div style="background:linear-gradient(180deg, $($Game.Bg1), $($Game.Bg3))">
$section2
    </div>

    <div class="spacer" style="background:linear-gradient(180deg, $($Game.Bg3), $($Game.Bg2))"></div>

    <div style="background:linear-gradient(180deg, $($Game.Bg2), $($Game.Bg4))">
$section3
    </div>

    <div class="spacer" style="background:linear-gradient(180deg, $($Game.Bg4), $($Game.Bg1))"></div>
"@
}

$games = @(
  @{
    Id = 'wordtycoon'
    Title = 'Word Tycoon'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/logo.png'
    Bg1 = '#0f172a'
    Bg2 = '#1e293b'
    Bg3 = '#164e63'
    Bg4 = '#312e81'
    Tone1 = '#7dd3fc'
    Tone2 = '#6ee7b7'
    Tone3 = '#fde68a'
    Tone4 = '#f9a8d4'
    Section1 = @('Tap', 'Build', 'Compete', 'In', 'Chat')
    Section2 = @('Businesses', 'Coins', 'Gifts', 'Live', 'Play')
    Section3 = @('Profile', 'Store', 'Games', 'Join Now', 'Word Tycoon')
  }
  @{
    Id = 'searchle'
    Title = 'Searchle'
    Host = 'searchle.live'
    Logo = '/portal/img/game-searchle.png'
    Bg1 = '#082f49'
    Bg2 = '#0f766e'
    Bg3 = '#164e63'
    Bg4 = '#172554'
    Tone1 = '#7dd3fc'
    Tone2 = '#6ee7b7'
    Tone3 = '#fde68a'
    Tone4 = '#c4b5fd'
    Section1 = @('Guess', 'The', 'Word', 'By', 'Meaning')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Clues', 'Guesses', 'Streaks', 'Play Now', 'Searchle')
  }
  @{
    Id = 'sproutle'
    Title = 'erecTangled'
    Host = 'erectangled.com'
    Logo = '/portal/img/game-sproutle.svg'
    Bg1 = '#052e16'
    Bg2 = '#166534'
    Bg3 = '#134e4a'
    Bg4 = '#4c1d95'
    Tone1 = '#86efac'
    Tone2 = '#67e8f9'
    Tone3 = '#fde68a'
    Tone4 = '#d8b4fe'
    Section1 = @('Ring', 'Based', 'Word', 'Grid', 'Play')
    Section2 = @('Expand', 'Solve', 'Daily', 'Or', 'Live')
    Section3 = @('Hidden', 'Words', 'Rings', 'Play Now', 'erecTangled')
  }
  @{
    Id = 'rectangled'
    Title = 'recTangled'
    Host = 'rectangled.live'
    Logo = '/portal/img/game-rectangled.svg'
    Bg1 = '#3f0d12'
    Bg2 = '#7f1d1d'
    Bg3 = '#1e1b4b'
    Bg4 = '#7c2d12'
    Tone1 = '#fca5a5'
    Tone2 = '#fdba74'
    Tone3 = '#93c5fd'
    Tone4 = '#f9a8d4'
    Section1 = @('Race', 'The', 'Grid', 'Find', 'Words')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Hidden', 'Letters', 'Fast', 'Play Now', 'recTangled')
  }
  @{
    Id = 'word500'
    Title = 'Word5000'
    Host = 'word5000.com'
    Logo = '/portal/img/game-word500.png'
    Bg1 = '#052e16'
    Bg2 = '#166534'
    Bg3 = '#14532d'
    Bg4 = '#1f2937'
    Tone1 = '#86efac'
    Tone2 = '#4ade80'
    Tone3 = '#fde68a'
    Tone4 = '#93c5fd'
    Section1 = @('5 Letter', 'Word', 'Race', 'Think', 'Fast')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Guess', 'Clues', 'Streaks', 'Play Now', 'Word5000')
  }
  @{
    Id = 'wordle'
    Title = 'Wordle'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-wordle.png'
    Bg1 = '#1f3b08'
    Bg2 = '#3f6212'
    Bg3 = '#365314'
    Bg4 = '#1f2937'
    Tone1 = '#bef264'
    Tone2 = '#86efac'
    Tone3 = '#fde68a'
    Tone4 = '#d9f99d'
    Section1 = @('Guess', 'The', 'Word', 'Any', 'Length')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Green', 'Yellow', 'Streaks', 'Play Now', 'Wordle')
  }
  @{
    Id = 'betweenly'
    Title = 'Betweenly'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-betweenly.png'
    Bg1 = '#312e81'
    Bg2 = '#4c1d95'
    Bg3 = '#1d4ed8'
    Bg4 = '#0f172a'
    Tone1 = '#c4b5fd'
    Tone2 = '#a5b4fc'
    Tone3 = '#93c5fd'
    Tone4 = '#fde68a'
    Section1 = @('Find', 'The', 'Word', 'In', 'Between')
    Section2 = @('Alphabet', 'Logic', 'Daily', 'Or', 'Live')
    Section3 = @('Closer', 'Farther', 'Clues', 'Play Now', 'Betweenly')
  }
  @{
    Id = 'pixeletters'
    Title = 'PixeLetters'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-pixeletters.png'
    Bg1 = '#831843'
    Bg2 = '#be185d'
    Bg3 = '#4c1d95'
    Bg4 = '#1d4ed8'
    Tone1 = '#f9a8d4'
    Tone2 = '#f0abfc'
    Tone3 = '#93c5fd'
    Tone4 = '#fde68a'
    Section1 = @('Reveal', 'The', 'Word', 'In', 'Pixels')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Zoom', 'Guess', 'Clues', 'Play Now', 'PixeLetters')
  }
  @{
    Id = 'spellingbee'
    Title = 'Spelling Bee'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-spellingbee.png'
    Bg1 = '#78350f'
    Bg2 = '#b45309'
    Bg3 = '#92400e'
    Bg4 = '#451a03'
    Tone1 = '#fcd34d'
    Tone2 = '#fde68a'
    Tone3 = '#fdba74'
    Tone4 = '#fef08a'
    Section1 = @('7 Letters', 'Build', 'Big', 'Words', 'Fast')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Pangrams', 'Chains', 'Streaks', 'Play Now', 'Spelling Bee')
  }
  @{
    Id = 'squaredle'
    Title = 'Squaredle'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-squaredle.png'
    Bg1 = '#3f0d12'
    Bg2 = '#9f1239'
    Bg3 = '#1f2937'
    Bg4 = '#312e81'
    Tone1 = '#fda4af'
    Tone2 = '#fca5a5'
    Tone3 = '#c4b5fd'
    Tone4 = '#93c5fd'
    Section1 = @('Search', 'The', 'Letter', 'Grid', 'Deep')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Words', 'Paths', 'Chains', 'Play Now', 'Squaredle')
  }
  @{
    Id = 'figural'
    Title = 'Figural'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-figural.png'
    Bg1 = '#083344'
    Bg2 = '#155e75'
    Bg3 = '#0f172a'
    Bg4 = '#172554'
    Tone1 = '#67e8f9'
    Tone2 = '#7dd3fc'
    Tone3 = '#c4b5fd'
    Tone4 = '#fde68a'
    Section1 = @('Symbols', 'Hide', 'The', 'Word', 'Clue')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Decode', 'Patterns', 'Fast', 'Play Now', 'Figural')
  }
  @{
    Id = 'unwordle'
    Title = 'UnWordle'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-unwordle.png'
    Bg1 = '#450a0a'
    Bg2 = '#991b1b'
    Bg3 = '#7f1d1d'
    Bg4 = '#1f2937'
    Tone1 = '#fca5a5'
    Tone2 = '#fda4af'
    Tone3 = '#fde68a'
    Tone4 = '#c4b5fd'
    Section1 = @('Give', 'Wrong', 'Answers', 'To', 'Win')
    Section2 = @('Reverse', 'Rules', 'Daily', 'Solo', 'Play')
    Section3 = @('Break', 'Patterns', 'Laugh', 'Play Now', 'UnWordle')
  }
  @{
    Id = 'wordmine'
    Title = 'Word Mine'
    Host = 'wordtycoon.live'
    Logo = '/portal/img/game-wordmine.png'
    Bg1 = '#14532d'
    Bg2 = '#166534'
    Bg3 = '#365314'
    Bg4 = '#44403c'
    Tone1 = '#86efac'
    Tone2 = '#bef264'
    Tone3 = '#fde68a'
    Tone4 = '#d6d3d1'
    Section1 = @('Dig', 'Deep', 'Find', 'Buried', 'Words')
    Section2 = @('Daily', 'Solo', 'Or', 'Live', 'Play')
    Section3 = @('Layers', 'Clues', 'Streaks', 'Play Now', 'Word Mine')
  }
)

foreach ($game in $games) {
  $setMarkup = New-SetMarkup -Game $game
  $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=100, initial-scale=1">
<title>$($game.Title) - Vertical Ad</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;900&family=Fredoka:wght@600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 100px;
    height: 4040px;
    overflow: hidden;
    background: transparent;
    font-family: 'Outfit', 'Segoe UI', Arial, sans-serif;
  }

  .scroll-track {
    width: 100px;
    height: 4040px;
    position: relative;
    overflow: hidden;
  }

  .scroll-inner {
    display: flex;
    flex-direction: column;
    animation: scrollUp 200s linear infinite;
    will-change: transform;
  }

  @keyframes scrollUp {
    0%   { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }

  .v-letter,
  .v-word {
    width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    text-transform: uppercase;
    line-height: 1;
    text-shadow:
      0 2px 8px rgba(0, 0, 0, 0.55),
      0 0 20px rgba(255, 255, 255, 0.08);
  }

  .v-letter {
    font-size: 58px;
    font-weight: 900;
    padding: 6px 0;
  }

  .v-letter.www {
    opacity: 0.35;
  }

  .v-letter.dot {
    font-size: 40px;
    padding: 2px 0;
    opacity: 0.35;
  }

  .v-letter.tld {
    font-size: 42px;
  }

  .v-word {
    font-family: 'Fredoka', sans-serif;
    font-weight: 700;
    letter-spacing: 1.4px;
    padding: 16px 0;
  }

  .v-word.big {
    font-size: 26px;
  }

  .v-word.small {
    font-size: 21px;
  }

  .v-word.tiny {
    font-size: 18px;
    letter-spacing: 1px;
    padding: 12px 0;
  }

  .tone1 { color: $($game.Tone1); text-shadow: 0 0 18px $($game.Tone1), 0 2px 8px rgba(0, 0, 0, 0.55); }
  .tone2 { color: $($game.Tone2); text-shadow: 0 0 18px $($game.Tone2), 0 2px 8px rgba(0, 0, 0, 0.55); }
  .tone3 { color: $($game.Tone3); text-shadow: 0 0 18px $($game.Tone3), 0 2px 8px rgba(0, 0, 0, 0.55); }
  .tone4 { color: $($game.Tone4); text-shadow: 0 0 18px $($game.Tone4), 0 2px 8px rgba(0, 0, 0, 0.55); }

  .ad-logo-row {
    width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 0;
  }

  .ad-logo-row img {
    width: 80px;
    height: 80px;
    border-radius: 22px;
    object-fit: cover;
    filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.28));
  }

  .spacer {
    height: 80px;
  }
</style>
</head>
<body>
<div class="scroll-track">
  <div class="scroll-inner">

$setMarkup
$setMarkup

  </div>
</div>
</body>
</html>
"@

  $path = Join-Path $outputDir ("ad-vertical-{0}.html" -f $game.Id)
  Set-Content -Path $path -Value $html -Encoding UTF8
  Write-Host "Wrote $path"
}
