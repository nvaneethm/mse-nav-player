# MSE Nav Player

[![CI](https://github.com/nvaneethm/mse-nav-player/actions/workflows/ci.yml/badge.svg)](https://github.com/nvaneethm/mse-nav-player/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mse-nav-player.svg)](https://www.npmjs.com/package/mse-nav-player)
[![npm downloads](https://img.shields.io/npm/dm/mse-nav-player.svg)](https://www.npmjs.com/package/mse-nav-player)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Browser Support:**
[![Chrome](https://img.shields.io/badge/Chrome-31%2B-brightgreen?logo=googlechrome&logoColor=white)](https://caniuse.com/mediasource)
[![Firefox](https://img.shields.io/badge/Firefox-42%2B-brightgreen?logo=firefox&logoColor=white)](https://caniuse.com/mediasource)
[![Safari](https://img.shields.io/badge/Safari-8%2B-brightgreen?logo=safari&logoColor=white)](https://caniuse.com/mediasource)
[![Edge](https://img.shields.io/badge/Edge-12%2B-brightgreen?logo=microsoftedge&logoColor=white)](https://caniuse.com/mediasource)

**Smart TV / Embedded:**
[![Tizen](https://img.shields.io/badge/Samsung%20Tizen-2.4%2B-blue?logo=samsung&logoColor=white)](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
[![WebOS](https://img.shields.io/badge/LG%20WebOS-3.0%2B-red?logoColor=white)](https://webostv.developer.lge.com/develop/specifications/web-engine)
[![AndroidTV](https://img.shields.io/badge/Android%20TV-5.0%2B-brightgreen?logo=android&logoColor=white)](https://developer.android.com/training/tv)
[![HbbTV](https://img.shields.io/badge/HbbTV-1.4%2B-orange?logoColor=white)](https://www.hbbtv.org/)

A lightweight, framework-agnostic JavaScript library for building custom DASH + MSE video players from scratch — perfect for learning, extending, or integrating with legacy and modern web platforms.

## Versioning

This project uses npm versioning (`npm version patch`) for managing releases.

For detailed changes in each version, see the [CHANGELOG.md](https://github.com/nvaneethm/mse-nav-player/blob/master/CHANGELOG.md).

## Features

- DASH `SegmentTemplate` support (`$Number$`, `$Time$`)
- Hybrid Adaptive Bitrate (ABR) — dual EWMA bandwidth estimator with switch-up cooldown
- Subtitles & Captions — WebVTT, TTML, and segmented MP4 text tracks via native TextTrack API
- Live DASH — manifest polling, DVR window, live edge seeking
- Works with Media Source Extensions (MSE)
- Supports legacy browsers and Smart TVs (Chrome 31+, Tizen 2.4+, WebOS 3.0+, Android TV 5.0+) via ES5 build
- Tree-shakable ESModule build for modern frameworks
- Written in TypeScript, published with full types
- Hookable lifecycle methods (`onPlay`, `onError`, etc.)
- Volume, mute, seek, and other player controls
- Resolution switching with manual/auto (ABR) modes

## Installation

```bash
npm install mse-nav-player
```

Or use directly in the browser:

```html
<script src="https://cdn.jsdelivr.net/npm/mse-nav-player/dist/mse-nav-player.es5.js"></script>
```

## Usage

```ts
import { Player } from "mse-nav-player"

const player = new Player()
player.attachVideoElement(document.getElementById("video")!)

player.onReady = () => console.log("Player is ready")
player.onError = (err) => console.error("Playback error", err)

await player.load("https://your.cdn/path/to/manifest.mpd")
player.play()
```

### Browser Example (Legacy Compatible)

```html
<video id="video" controls></video>
<script src="https://cdn.jsdelivr.net/npm/mse-nav-player/dist/mse-nav-player.es5.js"></script>
<script>
  const player = new MseNavPlayer.Player()
  player.attachVideoElement(document.getElementById("video"))
  player.load("https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd")
</script>
```

## API Reference: Player Class

### Initialization

```ts
const player = new Player()
player.attachVideoElement(videoElement)
player.load("https://example.com/manifest.mpd")
```

### Methods

| Method | Description |
| --- | --- |
| `attachVideoElement(video: HTMLVideoElement)` | Binds the video element |
| `load(manifestUrl: string)` | Loads and parses the DASH manifest |
| `play()` / `pause()` | Control playback |
| `seekTo(time: number)` | Jump to a specific timestamp |
| `setVolume(number)` / `mute()` / `unmute()` | Volume control |
| `reset()` / `destroy()` | Clear/reset/detach logic |
| `getBitrate()` | Returns current bitrate |
| `getResolution()` | Returns active video resolution |
| `getAvailableRenditions()` | Lists all video renditions |
| `setRendition(res: string)` | Switch to a specific resolution (disables ABR) |
| `setAdaptiveBitrate(enable: boolean)` | Enable or disable ABR |
| `getTextTracks()` | Returns available subtitle/caption tracks |
| `setTextTrack(language: string)` | Activate a subtitle track by language |
| `disableTextTrack()` | Hide all subtitle tracks |
| `isLive()` | Returns true for live DASH streams |
| `seekToLiveEdge()` | Jump to the live edge |
| `getDVRWindow()` | Returns `{ start, end }` of the DVR window |

### Event Hooks

```ts
player.onPlay = () => console.log("Playing")
player.onPause = () => console.log("Paused")
player.onEnded = () => console.log("Ended")
player.onReady = () => console.log("Ready")
player.onError = (err) => console.error(err)
player.onBuffering = () => console.log("Buffering")
player.onTimeUpdate = (t) => console.log("Time:", t)
```

## Development

```bash
# Install dependencies
npm install

# Build for both modern (ES6) and legacy (ES5)
npm run build

# Watch for changes and rebuild
npm run watch

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Generate API docs
npm run docs
```

## License

MIT © [Navaneeth M](https://github.com/nvaneethm)
