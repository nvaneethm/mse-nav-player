# MSE Nav Player

A lightweight, framework-agnostic JavaScript library for building custom DASH + MSE video players from scratch — perfect for learning, extending, or integrating with legacy and modern web platforms.

## Versioning

This project uses npm versioning (`npm version patch`) for managing releases. Each patch release increments the last number in the version (e.g., 1.0.x).

For detailed changes in each version, see the [CHANGELOG.md](CHANGELOG.md).

## Features

- DASH `SegmentTemplate` support (`$Number$`, `$Time$`)
- Generates segment URLs from MPD
- Works with Media Source Extensions (MSE)
- Supports legacy browsers (via ES5 build)
- Tree-shakable ESModule build for modern frameworks
- Written in TypeScript, published with full types
- Hookable lifecycle methods (`onPlay`, `onError`, etc.)
- Volume, mute, seek, and other player controls
- Resolution switching
- Rendition awareness
- Adaptive Bitrate toggle (stub for future)

## Installation

```bash
# Install via NPM
npm install mse-nav-player
```

Or use the UMD version directly in your browser:

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
  player.load(
    "https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd"
  )
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

| Method                                        | Description                        |
| --------------------------------------------- | ---------------------------------- |
| `attachVideoElement(video: HTMLVideoElement)` | Binds the video element            |
| `load(manifestUrl: string)`                   | Loads and parses the DASH manifest |
| `play()` / `pause()`                          | Control playback                   |
| `seekTo(time: number)`                        | Jump to a specific timestamp       |
| `setVolume(number)` / `mute()` / `unmute()`   | Volume control                     |
| `reset()` / `destroy()`                       | Clear/reset/detach logic           |
| `getBitrate()`                                | Returns current bitrate            |
| `getResolution()`                             | Returns active video resolution    |
| `getAvailableRenditions()`                    | Lists all video renditions         |
| `setRendition(res: string)`                   | Switch to a specific resolution    |
| `setAdaptiveBitrate(enable: boolean)`         | Toggle ABR (stub for now)          |

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
```

## License

MIT © [Navaneeth M](https://github.com/nvaneethm)
