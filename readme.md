

 # 📼 mse-nav-player
 
 A lightweight, framework-agnostic JavaScript library for building custom DASH + MSE video players from scratch — perfect for learning, extending, or integrating with legacy and modern web platforms.
 
 ---
 
 ## 🔧 Features
 
 - ✅ DASH `SegmentTemplate` support (`$Number$`, `$Time$`)
 - ✅ Generates segment URLs from MPD
 - ✅ Works with Media Source Extensions (MSE)
 - ✅ Supports legacy browsers (via ES5 build)
 - ✅ Tree-shakable ESModule build for modern frameworks
 - ✅ Written in TypeScript, published with full types
 - ✅ Hookable lifecycle methods (`onPlay`, `onError`, etc.)
 - ✅ Volume, mute, seek, and other player controls
 
 ---
 
 ## 📦 Installation
 
 ```bash
 # Install via NPM
 npm install mse-nav-player
 ```
 
 Or use the UMD version directly in your browser:
 
 ```html
 <script src="https://cdn.jsdelivr.net/npm/mse-nav-player/dist/mse-nav-player.es5.js"></script>
 ```
 
 ---
 
 ## 📁 Usage
 
```ts
import { Player } from 'mse-nav-player';

const player = new Player();
player.attachVideoElement(document.getElementById('video')!);

player.onReady = () => console.log('Player is ready');
player.onError = err => console.error('Playback error', err);

await player.load('https://your.cdn/path/to/manifest.mpd');
player.play();
```
 
 ---
 
 ### ✅ Example 2: In Browser (Legacy Compatible)
 

```html
  <script>
    const player = new MseNavPlayer.Player();
    player.attachVideoElement(document.getElementById('video'));
    player.load('https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd');
  </script>
```
 

 
 ## 📦 Build Setup (for Contributors)
 
 ```bash
 # Install dependencies
 npm install
 
 # Build for both modern (ES6) and legacy (ES5)
 npm run build
 
 # Start local dev server
 npm run start
 
 # Watch for changes and rebuild
 npm run watch
 ```
 
 ---

 ## ✅ TODO
	•	Adaptive bitrate switching
	•	Live/low latency stream support
	•	Subtitle support (WebVTT)
	•	Keyboard and remote control bindings
 
 ## 📃 License
 
 MIT © [Navaneeth M](https://github.com/nvaneethm)