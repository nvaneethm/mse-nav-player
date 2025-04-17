

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
 
 ### ✅ Example 1: In a Modern JavaScript App (ESModules)
 
 ```ts
 import { SegmentURLGenerator } from 'mse-nav-player';
 
 const generator = new SegmentURLGenerator({
   baseURL: 'https://cdn.example.com/',
   representationID: '360_800000',
   initialization: '../video/$RepresentationID$/dash/init.mp4',
   media: '../video/$RepresentationID$/dash/segment_$Number$.m4s',
   startNumber: 0,
   timescale: 25000,
   duration: 100000
 });
 
 console.log(generator.getInitializationURL());
 console.log(generator.getMediaSegmentURL(1));
 ```
 
 ---
 
 ### ✅ Example 2: In Browser (Legacy Compatible)
 
 ```html
 <script src="https://cdn.jsdelivr.net/npm/mse-nav-player/dist/mse-nav-player.es5.js"></script>
 <script>
   const gen = new MseNavPlayer.SegmentURLGenerator({
     baseURL: 'https://cdn.example.com/',
     representationID: 'audio_128k',
     initialization: '../audio/$RepresentationID$/dash/init.mp4',
     media: '../audio/$RepresentationID$/dash/segment_$Time$.m4s',
     startNumber: 0,
     timescale: 48000,
     duration: 192000,
     useTimeTemplate: true
   });
 
   console.log(gen.getInitializationURL());
 </script>
 ```
 
 ---
 
 <!-- ## 🧱 Modules
 
 ### `SegmentURLGenerator`
 
 Generates segment URLs from `SegmentTemplate` MPD rules.
 
 | Method                    | Description                                      |
 |--------------------------|--------------------------------------------------|
 | `getInitializationURL()` | Returns init segment URL                         |
 | `getMediaSegmentURL(n)`  | Returns URL for the nth media segment            |
 
 --- -->
 
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
 
 ## 📃 License
 
 MIT © [Navaneeth M](https://github.com/nvaneethm)