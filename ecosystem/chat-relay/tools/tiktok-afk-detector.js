/**
 * TikTok Live Studio AFK Verification Detector v5
 *
 * Standalone — uses its own Discord bot (AFK Alert Bot).
 * Captures TikTok Live Studio screen, detects popups,
 * sends DM with screenshot + joins voice channel to play alert.
 *
 * Usage: node tiktok-afk-detector.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');

let voice;
try {
    voice = require('@discordjs/voice');
} catch (e) {
    console.warn('[AFK] @discordjs/voice not installed — voice alerts disabled');
}

// ── Config ──
const BOT_TOKEN = process.env.AFK_BOT_TOKEN;
const DISCORD_USER_ID = '179331908499406849';
const CHECK_INTERVAL_MS = 5000;
const CENTER_REGION_RATIO = 0.4;
const COOLDOWN_MS = 5 * 60 * 1000;
const VOICE_ALERT_REPEATS = 3;
const AFK_CHANNEL_NAME = 'afk-alerts';
const SCREENSHOT_DIR = path.join(__dirname, 'afk-screenshots');
const ALERT_SOUND = path.join(__dirname, 'afk-alert.wav');

// ── TikTok window info ──
const MONITOR = { x: -1932, y: -2174, width: 1920, height: 1080 };

// ── State ──
let previousPixels = null;
let lastAlertTime = 0;
let discordClient = null;
let afkVoiceChannel = null;
let consecutiveChanges = 0;
let checkRunning = false;
const REQUIRED_CONSECUTIVE_DIFF = 2;
const REQUIRED_CONSECUTIVE_DIM = 3;

// ── Ensure dirs ──
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ── PowerShell scripts ──
function safeWrite(filePath, content) {
    try { fs.writeFileSync(filePath, content); }
    catch(e) { /* file locked by another instance, use existing */ }
}

const PS_CAPTURE_SCRIPT = path.join(SCREENSHOT_DIR, 'capture.ps1');
safeWrite(PS_CAPTURE_SCRIPT, `
param([string]$outPath, [string]$pngPath)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$x = ${MONITOR.x}
$y = ${MONITOR.y}
$w = ${MONITOR.width}
$h = ${MONITOR.height}

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$gfx.Dispose()

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
if ($pngPath) {
    $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
$bmp.Dispose()
`);

const PS_SAMPLE_SCRIPT = path.join(SCREENSHOT_DIR, 'sample.ps1');
safeWrite(PS_SAMPLE_SCRIPT, `
param([string]$imgPath)
Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
$w = $bmp.Width
$h = $bmp.Height

$ratio = ${CENTER_REGION_RATIO}
$cx = [int]($w * (1 - $ratio) / 2)
$cy = [int]($h * (1 - $ratio) / 2)
$cw = [int]($w * $ratio)
$ch = [int]($h * $ratio)

$step = 20
$pixels = @()
for ($sy = $cy; $sy -lt ($cy + $ch); $sy += $step) {
    for ($sx = $cx; $sx -lt ($cx + $cw); $sx += $step) {
        $c = $bmp.GetPixel($sx, $sy)
        $pixels += "$($c.R),$($c.G),$($c.B)"
    }
}
$bmp.Dispose()
Write-Host ($pixels -join "|")
`);

const PS_ANALYZE_SCRIPT = path.join(SCREENSHOT_DIR, 'analyze.ps1');
safeWrite(PS_ANALYZE_SCRIPT, `
param([string]$imgPath)
Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
$W = $bmp.Width
$H = $bmp.Height

function Get-RoiMetrics($xRatio, $yRatio, $wRatio, $hRatio, $step) {
    $x0 = [int]($W * $xRatio)
    $y0 = [int]($H * $yRatio)
    $rw = [int]($W * $wRatio)
    $rh = [int]($H * $hRatio)
    if ($rw -lt 1) { $rw = 1 }
    if ($rh -lt 1) { $rh = 1 }

    $samples = 0
    $sumBrightness = 0.0
    $bright = 0
    $dark = 0
    $white = 0
    $red = 0
    $green = 0
    $gray = 0
    $prev = $null
    $edgeish = 0

    for ($y = $y0; $y -lt ($y0 + $rh); $y += $step) {
        for ($x = $x0; $x -lt ($x0 + $rw); $x += $step) {
            $c = $bmp.GetPixel($x, $y)
            $r = [int]$c.R
            $g = [int]$c.G
            $b = [int]$c.B
            $brightness = ($r + $g + $b) / 3.0
            $sumBrightness += $brightness
            $samples++

            if ($brightness -gt 170) { $bright++ }
            if ($brightness -lt 105) { $dark++ }
            if ($brightness -gt 215 -and [Math]::Abs($r - $g) -lt 28 -and [Math]::Abs($r - $b) -lt 28) { $white++ }
            if ($r -gt 145 -and ($r - $g) -gt 45 -and ($r - $b) -gt 45) { $red++ }
            if ($g -gt 125 -and ($g - $r) -gt 25 -and ($g - $b) -gt 20) { $green++ }
            if ([Math]::Abs($r - $g) -lt 18 -and [Math]::Abs($r - $b) -lt 18 -and $brightness -gt 55 -and $brightness -lt 195) { $gray++ }

            if ($prev -ne $null) {
                $delta = [Math]::Abs($prev.r - $r) + [Math]::Abs($prev.g - $g) + [Math]::Abs($prev.b - $b)
                if ($delta -gt 90) { $edgeish++ }
            }
            $prev = @{ r = $r; g = $g; b = $b }
        }
    }

    if ($samples -eq 0) {
        return @{
            avgBrightness = 0
            brightRatio = 0
            darkRatio = 0
            whiteRatio = 0
            redRatio = 0
            greenRatio = 0
            grayRatio = 0
            edgeRatio = 0
            sampleCount = 0
        }
    }

    return @{
        avgBrightness = [Math]::Round($sumBrightness / $samples, 2)
        brightRatio = [Math]::Round($bright / $samples, 4)
        darkRatio = [Math]::Round($dark / $samples, 4)
        whiteRatio = [Math]::Round($white / $samples, 4)
        redRatio = [Math]::Round($red / $samples, 4)
        greenRatio = [Math]::Round($green / $samples, 4)
        grayRatio = [Math]::Round($gray / $samples, 4)
        edgeRatio = [Math]::Round($edgeish / [Math]::Max(1, $samples - 1), 4)
        sampleCount = $samples
    }
}

$result = @{
    center = Get-RoiMetrics 0.32 0.20 0.36 0.58 10
    modal = Get-RoiMetrics 0.37 0.24 0.26 0.38 8
    topToast = Get-RoiMetrics 0.34 0.05 0.34 0.15 8
    captcha = Get-RoiMetrics 0.43 0.48 0.15 0.17 6
    footerLeft = Get-RoiMetrics 0.39 0.57 0.12 0.06 6
    footerRight = Get-RoiMetrics 0.51 0.57 0.12 0.06 6
    footerWide = Get-RoiMetrics 0.39 0.56 0.24 0.08 6
    iconLeft = Get-RoiMetrics 0.39 0.40 0.05 0.10 5
    textBody = Get-RoiMetrics 0.40 0.31 0.21 0.22 6
}

$bmp.Dispose()
$result | ConvertTo-Json -Compress -Depth 5
`);

function captureAndSample() {
    const bmpPath = path.join(SCREENSHOT_DIR, 'current.bmp');
    const pngPath = path.join(SCREENSHOT_DIR, 'current.png');
    try {
        execSync(`powershell -ExecutionPolicy Bypass -File "${PS_CAPTURE_SCRIPT}" -outPath "${bmpPath}" -pngPath "${pngPath}"`, {
            timeout: 15000, stdio: 'pipe'
        });
        const output = execSync(`powershell -ExecutionPolicy Bypass -File "${PS_SAMPLE_SCRIPT}" -imgPath "${bmpPath}"`, {
            timeout: 15000, stdio: 'pipe', encoding: 'utf-8'
        }).trim();
        if (!output) return null;
        return output.split('|').map(p => {
            const [r, g, b] = p.split(',').map(Number);
            return { r, g, b };
        });
    } catch (err) {
        console.error('[AFK] Screenshot error:', err.message.split('\n')[0]);
        return null;
    }
}

function analyzeScreenshot(pngPath) {
    try {
        const output = execSync(`powershell -ExecutionPolicy Bypass -File "${PS_ANALYZE_SCRIPT}" -imgPath "${pngPath}"`, {
            timeout: 15000, stdio: 'pipe', encoding: 'utf-8'
        }).trim();
        if (!output) return null;
        return JSON.parse(output);
    } catch (err) {
        console.error('[AFK] Analyze error:', err.message.split('\n')[0]);
        return null;
    }
}

function comparePixels(prev, curr) {
    if (!prev || !curr || prev.length !== curr.length) return 0;
    let diffCount = 0;
    const threshold = 40;
    for (let i = 0; i < prev.length; i++) {
        const dr = Math.abs(prev[i].r - curr[i].r);
        const dg = Math.abs(prev[i].g - curr[i].g);
        const db = Math.abs(prev[i].b - curr[i].b);
        if (dr > threshold || dg > threshold || db > threshold) diffCount++;
    }
    return diffCount / prev.length;
}

/**
 * Detect popup by checking if center region is unusually bright.
 * TikTok Live Studio has a dark UI — popups/modals are bright overlays.
 * Returns brightness ratio (0-1) where >0.5 = likely popup.
 */
function detectBrightPopup(pixels) {
    if (!pixels || pixels.length === 0) return 0;
    let brightCount = 0;
    const brightnessThreshold = 150; // pixels brighter than this = likely popup
    for (let i = 0; i < pixels.length; i++) {
        const brightness = (pixels[i].r + pixels[i].g + pixels[i].b) / 3;
        if (brightness > brightnessThreshold) brightCount++;
    }
    return brightCount / pixels.length;
}

/**
 * Detect if a large uniform-colored region appeared (modal overlay).
 * Popups have large areas of similar color; normal UI has varied colors.
 */
function detectUniformRegion(pixels) {
    if (!pixels || pixels.length < 10) return 0;
    // Count how many pixels are within a tight color range of each other
    // Sample 100 random pairs
    let similarCount = 0;
    const totalPairs = 200;
    const similarThreshold = 30;
    for (let i = 0; i < totalPairs; i++) {
        const a = pixels[Math.floor(Math.random() * pixels.length)];
        const b = pixels[Math.floor(Math.random() * pixels.length)];
        const dr = Math.abs(a.r - b.r);
        const dg = Math.abs(a.g - b.g);
        const db = Math.abs(a.b - b.b);
        if (dr < similarThreshold && dg < similarThreshold && db < similarThreshold) similarCount++;
    }
    return similarCount / totalPairs;
}

function classifyPopup(analysis, diffFromBaseline, dimRatio) {
    if (!analysis) {
        return { type: 'unknown_change', alertable: false, confidence: 0, manualAction: null, reasons: ['analysis_missing'] };
    }

    const { center, modal, topToast, captcha, footerLeft, footerRight, footerWide, iconLeft, textBody } = analysis;
    const reasons = [];

    const modalPresent =
        modal.darkRatio > 0.72 &&
        modal.edgeRatio > 0.12 &&
        textBody.edgeRatio > 0.14 &&
        footerWide.darkRatio > 0.55;

    const topToastLikely =
        topToast.darkRatio > 0.55 &&
        topToast.edgeRatio > 0.05 &&
        !modalPresent;

    const promoCenterLikely =
        center.darkRatio > 0.72 &&
        textBody.edgeRatio > 0.18 &&
        captcha.whiteRatio < 0.16 &&
        footerWide.redRatio < 0.10 &&
        footerRight.redRatio < 0.10 &&
        footerLeft.redRatio < 0.10;

    const modalPromoLikely =
        modalPresent &&
        captcha.whiteRatio < 0.16 &&
        footerWide.redRatio < 0.10 &&
        footerRight.redRatio < 0.10 &&
        footerLeft.redRatio < 0.10 &&
        iconLeft.greenRatio < 0.10 &&
        iconLeft.redRatio < 0.14;

    const afkVerification =
        modalPresent &&
        captcha.whiteRatio > 0.22 &&
        footerWide.redRatio > 0.12;

    const giftingSuspended =
        modalPresent &&
        footerRight.redRatio > 0.18 &&
        footerLeft.darkRatio > 0.45 &&
        captcha.whiteRatio < 0.14 &&
        iconLeft.redRatio < 0.12 &&
        iconLeft.greenRatio < 0.12;

    const appealReason =
        modalPresent &&
        footerRight.redRatio > 0.16 &&
        footerLeft.darkRatio < 0.35 &&
        captcha.whiteRatio < 0.12 &&
        textBody.edgeRatio > 0.20 &&
        textBody.darkRatio > 0.55;

    const appealApproved =
        modalPresent &&
        iconLeft.greenRatio > 0.14 &&
        footerRight.grayRatio > 0.25 &&
        footerRight.redRatio < 0.08 &&
        captcha.whiteRatio < 0.12;

    if (afkVerification) {
        reasons.push('center_dark_modal', 'captcha_panel', 'red_confirm');
        return {
            type: 'afk_verification',
            alertable: true,
            confidence: Math.min(0.99, 0.72 + captcha.whiteRatio + footerWide.redRatio),
            manualAction: 'Manual action needed: complete LIVE verification',
            reasons
        };
    }

    if (giftingSuspended) {
        reasons.push('center_dark_modal', 'two_button_footer', 'restriction_layout');
        return {
            type: 'gifting_suspended',
            alertable: true,
            confidence: Math.min(0.98, 0.70 + footerRight.redRatio + footerLeft.darkRatio * 0.2),
            manualAction: 'Manual action needed: restriction popup detected',
            reasons
        };
    }

    if (appealReason) {
        reasons.push('center_dark_modal', 'single_submit_button', 'radio_list_layout');
        return {
            type: 'appeal_reason',
            alertable: true,
            confidence: Math.min(0.97, 0.68 + footerRight.redRatio + textBody.edgeRatio * 0.3),
            manualAction: 'Manual action needed: appeal reason screen detected',
            reasons
        };
    }

    if (appealApproved) {
        reasons.push('center_dark_modal', 'green_success_icon', 'ok_button_layout');
        return {
            type: 'appeal_approved',
            alertable: true,
            confidence: Math.min(0.98, 0.72 + iconLeft.greenRatio + footerRight.grayRatio * 0.2),
            manualAction: 'Manual action needed: approval dialog detected',
            reasons
        };
    }

    if (topToastLikely) {
        reasons.push('top_toast_layout');
        return {
            type: 'false_positive_top_toast',
            alertable: false,
            confidence: Math.min(0.95, 0.65 + topToast.grayRatio),
            manualAction: null,
            reasons
        };
    }

    if (modalPromoLikely) {
        reasons.push('center_card_without_popup_controls');
        return {
            type: 'false_positive_promo',
            alertable: false,
            confidence: Math.min(0.94, 0.60 + center.darkRatio * 0.2 + textBody.edgeRatio),
            manualAction: null,
            reasons
        };
    }

    if (promoCenterLikely) {
        reasons.push('fullscreen_branded_overlay');
        return {
            type: 'false_positive_promo',
            alertable: false,
            confidence: Math.min(0.94, 0.58 + center.darkRatio * 0.2 + textBody.edgeRatio),
            manualAction: null,
            reasons
        };
    }

    if (!modalPresent && center.brightRatio > 0.22 && center.darkRatio < 0.58) {
        reasons.push('center_visual_change_without_modal');
        return {
            type: 'false_positive_robot_zoom',
            alertable: false,
            confidence: Math.min(0.90, 0.55 + center.brightRatio),
            manualAction: null,
            reasons
        };
    }

    if (!modalPresent && center.darkRatio > 0.45 && textBody.edgeRatio > 0.18) {
        reasons.push('promo_card_layout');
        return {
            type: 'false_positive_promo',
            alertable: false,
            confidence: Math.min(0.90, 0.50 + textBody.edgeRatio + center.darkRatio * 0.1),
            manualAction: null,
            reasons
        };
    }

    return {
        type: 'unknown_change',
        alertable: false,
        confidence: Math.min(0.75, 0.35 + diffFromBaseline + dimRatio),
        manualAction: null,
        reasons: ['unclassified_change']
    };
}

/**
 * Find afk-alerts voice channel
 */
function findVoiceChannel() {
    if (afkVoiceChannel) return afkVoiceChannel;
    for (const [, guild] of discordClient.guilds.cache) {
        const ch = guild.channels.cache.find(c => c.name === AFK_CHANNEL_NAME && c.type === 2);
        if (ch) {
            afkVoiceChannel = ch;
            return ch;
        }
    }
    return null;
}

/**
 * Play soundboard — join channel, play sounds, stay for 60 seconds, then leave
 */
async function playSoundboardAlert() {
    if (!voice) return;
    const channel = findVoiceChannel();
    if (!channel) { console.error('[AFK] No #afk-alerts channel'); return; }

    const https = require('https');
    let connection;

    try {
        connection = voice.joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false
        });
        connection.on('error', () => {});

        // Wait for Discord to register the voice session
        await new Promise(r => setTimeout(r, 5000));
        console.log('[AFK] Joined #afk-alerts for soundboard');

        // Play airhorn 3 times
        for (let i = 0; i < VOICE_ALERT_REPEATS; i++) {
            await new Promise((resolve) => {
                const data = JSON.stringify({
                    sound_id: '2',  // airhorn
                    source_guild_id: channel.guild.id
                });

                const req = https.request({
                    hostname: 'discord.com',
                    path: `/api/v10/channels/${channel.id}/send-soundboard-sound`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Content-Length': data.length
                    }
                }, (res) => {
                    let body = '';
                    res.on('data', d => body += d);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log(`[AFK] Airhorn! (${res.statusCode})`);
                        } else {
                            console.error(`[AFK] Soundboard failed (${res.statusCode}): ${body}`);
                        }
                        resolve();
                    });
                });
                req.on('error', (err) => { console.error('[AFK] Soundboard error:', err.message); resolve(); });
                req.write(data);
                req.end();
            });

            await new Promise(r => setTimeout(r, 3000));
        }

        // Stay in channel for 60 seconds so user can hear it
        console.log('[AFK] Staying in channel for 60s...');
        setTimeout(() => {
            try { connection.destroy(); } catch(e) {}
            console.log('[AFK] Left #afk-alerts');
        }, 60000);

    } catch (err) {
        console.error('[AFK] Soundboard error:', err.message);
        setTimeout(() => { try { if (connection) connection.destroy(); } catch(e) {} }, 5000);
    }
}

/**
 * Send DM with screenshot + voice alert
 */
async function sendAlert(analysis) {
    const now = Date.now();
    if (now - lastAlertTime < COOLDOWN_MS) {
        console.log('[AFK] Alert suppressed (cooldown)');
        return;
    }
    lastAlertTime = now;

    const detectionPng = path.join(SCREENSHOT_DIR, `detection-${now}.png`);
    try { fs.copyFileSync(path.join(SCREENSHOT_DIR, 'current.png'), detectionPng); } catch (e) {}

    console.log(`\n🚨 [AFK] ${analysis.type.toUpperCase()} DETECTED! Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);

    if (!discordClient || !discordClient.isReady()) {
        console.error('[AFK] Bot not ready');
        return;
    }

    // Send DM with screenshot
    try {
        const user = await discordClient.users.fetch(DISCORD_USER_ID);
        const msgOpts = {
            content:
                `🚨 **TikTok Popup Detected: ${analysis.type}**\n` +
                `Confidence: **${(analysis.confidence * 100).toFixed(0)}%**\n` +
                `Reasons: ${analysis.reasons.join(', ')}\n` +
                `Time: <t:${Math.floor(now / 1000)}:T>\n` +
                `⚠️ ${analysis.manualAction || 'Manual review recommended.'}`
        };

        if (fs.existsSync(detectionPng)) {
            msgOpts.files = [new AttachmentBuilder(detectionPng, { name: 'tiktok-screen.png' })];
        }

        await user.send(msgOpts);
        console.log('[AFK] DM sent with screenshot!');
    } catch (err) {
        console.error('[AFK] DM failed:', err.message);
    }

    // Ping @mention in #afk-alerts text channel (triggers phone notification)
    try {
        const channel = findVoiceChannel();
        if (channel) {
            for (let i = 0; i < 3; i++) {
                await channel.send(`🚨 <@${DISCORD_USER_ID}> **${analysis.type.replace(/_/g, ' ').toUpperCase()}** — ${analysis.manualAction || 'check screenshot'} 🚨`);
                await new Promise(r => setTimeout(r, 1500));
            }
            console.log('[AFK] Channel pings sent!');
        }
    } catch (err) {
        console.error('[AFK] Ping failed:', err.message);
    }

    // Soundboard alert (REST API, no UDP needed)
    playSoundboardAlert().catch(err => console.error('[AFK] Soundboard failed:', err.message));
}

// ── Stable baseline + classifier approach ──
// Instead of firing on generic center change, compare against a stable baseline,
// then classify the screenshot into real popup types vs known false positives.
let baselinePixels = null;
let baselineAge = 0;
const BASELINE_UPDATE_INTERVAL = 30; // update baseline every 30 calm checks (~2.5 min)
const DIFF_FROM_BASELINE_THRESHOLD = 0.20; // 20% diff from stable baseline = popup
const DIMMING_THRESHOLD = 0.25; // 25% dimming — chat toasts were too noisy at 15%
const SUPPRESSION_COOLDOWN_MS = 45 * 1000; // avoid re-analyzing the same false-positive state constantly
let suppressionUntil = 0;
let lastSuppressedType = null;

function blendPixels(prev, curr, alpha = 0.35) {
    if (!prev || !curr || prev.length !== curr.length) return curr;
    const blended = new Array(curr.length);
    for (let i = 0; i < curr.length; i++) {
        blended[i] = {
            r: Math.round(prev[i].r * (1 - alpha) + curr[i].r * alpha),
            g: Math.round(prev[i].g * (1 - alpha) + curr[i].g * alpha),
            b: Math.round(prev[i].b * (1 - alpha) + curr[i].b * alpha)
        };
    }
    return blended;
}

function check() {
    if (checkRunning) return;
    checkRunning = true;
    try {
        const pixels = captureAndSample();
        if (!pixels) { checkRunning = false; return; }

        const timestamp = new Date().toLocaleTimeString();

        // First run — set baseline
        if (!baselinePixels) {
            baselinePixels = pixels;
            previousPixels = pixels;
            console.log(`[${timestamp}] Baseline captured (${pixels.length} samples)`);
            checkRunning = false;
            return;
        }

        // Compare current frame to STABLE BASELINE (not previous frame)
        const diffFromBaseline = comparePixels(baselinePixels, pixels);

        // Detect screen dimming (notification overlay dims the background)
        function avgBrightness(px) {
            let sum = 0;
            for (let i = 0; i < px.length; i++) sum += (px[i].r + px[i].g + px[i].b) / 3;
            return sum / px.length;
        }
        const baselineBright = avgBrightness(baselinePixels);
        const currentBright = avgBrightness(pixels);
        const dimRatio = baselineBright > 10 ? (baselineBright - currentBright) / baselineBright : 0;
        const isDimmed = dimRatio > DIMMING_THRESHOLD;

        // Popup prefilter: large persistent diff from baseline OR significant screen dimming
        const popupCandidate = diffFromBaseline > DIFF_FROM_BASELINE_THRESHOLD || isDimmed;
        const now = Date.now();
        const candidateMode = isDimmed && diffFromBaseline <= DIFF_FROM_BASELINE_THRESHOLD ? 'dim' : 'diff';
        const requiredConsecutive = candidateMode === 'dim' ? REQUIRED_CONSECUTIVE_DIM : REQUIRED_CONSECUTIVE_DIFF;

        // If we recently suppressed a false positive and the screen still looks broadly similar,
        // skip ROI analysis and let the baseline adapt toward the new steady state.
        if (popupCandidate && now < suppressionUntil && diffFromBaseline < 0.45 && dimRatio < 0.45) {
            baselinePixels = blendPixels(baselinePixels, pixels, 0.45);
            previousPixels = pixels;
            checkRunning = false;
            return;
        }

        if (popupCandidate) {
            consecutiveChanges++;
            const reason = isDimmed ? `dimmed ${(dimRatio * 100).toFixed(0)}%` : `diff ${(diffFromBaseline * 100).toFixed(1)}%`;
            console.log(`[${timestamp}] ⚠️  Candidate? ${reason} from baseline (${consecutiveChanges}/${requiredConsecutive}, ${candidateMode})`);

            if (consecutiveChanges >= requiredConsecutive) {
                const currentPng = path.join(SCREENSHOT_DIR, 'current.png');
                const analysis = classifyPopup(analyzeScreenshot(currentPng), diffFromBaseline, dimRatio);

                if (analysis.alertable) {
                    console.log(`[${timestamp}] 🚨 Classified as ${analysis.type} (${(analysis.confidence * 100).toFixed(0)}%)`);
                    sendAlert(analysis);
                    // Reset baseline after real alert to prevent re-triggering on the same popup
                    baselinePixels = null;
                    previousPixels = null;
                    suppressionUntil = 0;
                    lastSuppressedType = null;
                } else {
                    console.log(`[${timestamp}] ↩ Suppressed as ${analysis.type} (${(analysis.confidence * 100).toFixed(0)}%)`);
                    baselinePixels = blendPixels(baselinePixels, pixels, 0.65);
                    baselineAge = 0;
                    suppressionUntil = now + SUPPRESSION_COOLDOWN_MS;
                    lastSuppressedType = analysis.type;
                }

                consecutiveChanges = 0;
                checkRunning = false;
                return;
            }
        } else {
            if (consecutiveChanges > 0) {
                console.log(`[${timestamp}] ✓ Stabilized (${(diffFromBaseline * 100).toFixed(1)}% from baseline)`);
            }
            consecutiveChanges = 0;

            // Update baseline periodically when screen is calm
            baselineAge++;
            if (baselineAge >= BASELINE_UPDATE_INTERVAL) {
                baselinePixels = blendPixels(baselinePixels, pixels, 0.5);
                baselineAge = 0;
            }
        }

        previousPixels = pixels;
    } catch (err) {
        console.error('[AFK] Check error:', err.message);
    }
    checkRunning = false;
}

// ── Main ──
async function main() {
    if (!BOT_TOKEN) {
        console.error('[AFK] AFK_BOT_TOKEN not set in .env!');
        process.exit(1);
    }

    console.log('═══════════════════════════════════════════');
    console.log('  TikTok AFK Detector v5 (Stable Baseline)');
    console.log('═══════════════════════════════════════════');
    console.log(`Monitor: DISPLAY5 (${MONITOR.width}x${MONITOR.height})`);
    console.log(`Check: ${CHECK_INTERVAL_MS / 1000}s | Diff threshold: ${DIFF_FROM_BASELINE_THRESHOLD * 100}% | Dimming threshold: ${DIMMING_THRESHOLD * 100}%`);
    console.log(`Baseline refresh: every ${BASELINE_UPDATE_INTERVAL} calm checks`);
    console.log(`Suppression cooldown: ${SUPPRESSION_COOLDOWN_MS / 1000}s | Consecutive: diff=${REQUIRED_CONSECUTIVE_DIFF}, dim=${REQUIRED_CONSECUTIVE_DIM}`);
    console.log(`Cooldown: ${COOLDOWN_MS / 1000 / 60} min | Voice: ${voice ? 'enabled' : 'disabled'}`);
    console.log('');

    // Init Discord bot
    discordClient = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildVoiceStates
        ]
    });

    discordClient.on('ready', async () => {
        console.log(`[Discord] Bot ready: ${discordClient.user.tag}`);
        console.log(`[Discord] In ${discordClient.guilds.cache.size} guild(s)`);
        const vc = findVoiceChannel();
        if (vc) {
            console.log(`[Discord] Alert channel: #${vc.name} in ${vc.guild.name}`);
        } else {
            console.warn(`[Discord] No #${AFK_CHANNEL_NAME} channel found`);
        }
    });

    await discordClient.login(BOT_TOKEN);

    // Baseline
    console.log('[AFK] Capturing baseline...');
    previousPixels = captureAndSample();
    if (previousPixels) console.log(`[AFK] Baseline: ${previousPixels.length} pixels`);
    else console.error('[AFK] Baseline failed!');

    console.log('[AFK] Monitoring started.\n');
    setInterval(check, CHECK_INTERVAL_MS);
}

process.on('uncaughtException', (err) => {
    console.error('[AFK] Uncaught (continuing):', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[AFK] Unhandled rejection (continuing):', reason?.message || reason);
});

// Keep process alive
setInterval(() => {}, 60000);

main().catch(console.error);
