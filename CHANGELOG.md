# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses npm versioning (`npm version patch`).

## [1.1.0] - 2026-04-26

### Added

#### Hybrid ABR (Adaptive Bitrate)
- `AbrController` — dual EWMA bandwidth estimator (slow α=0.1 for upgrades, fast α=0.5 for downgrades) with a 0.8× safety margin and 8-second switch-up cooldown
- `SegmentFetcher` now measures `downloadBandwidth` (bits/sec) per segment fetch using `performance.now()` timing
- ABR is enabled by default; calling `player.setRendition()` manually disables it so the user's choice is respected
- `player.setAdaptiveBitrate(true)` re-enables ABR after a manual selection
- Demo page: "Auto (ABR)" option in the rendition selector that activates ABR; label updates in real time showing current ABR-selected quality

#### Subtitles / Captions
- `TextTrackHandler` — parses and renders subtitle tracks via the native `HTMLVideoElement` TextTrack API (no MSE SourceBuffer needed for text)
- Supports plain WebVTT sidecar files, segmented WebVTT in MP4 (`wvtt` codec), and TTML in MP4 (`stpp` codec)
- `MPDParser` now detects and returns `textTracks[]` from `AdaptationSet` elements (identified by mimeType, codecs, or `ContentComponent contentType="text"`)
- `SegmentTemplateInfo` extended with `trackType`, `language`, and `role` fields
- New player API: `player.getTextTracks()`, `player.setTextTrack(language)`, `player.disableTextTrack()`

#### Live DASH
- `ManifestRefresher` — polls live MPD URLs at the `minimumUpdatePeriod` interval and merges new segments into the timeline
- `MPDParser` now parses `@type`, `@minimumUpdatePeriod`, `@availabilityStartTime`, and `@timeShiftBufferDepth`
- `TimelineModel` extended with `appendSegments()`, `trimBefore()`, `getLiveEdge()`, `getAvailabilityRange()`, and `setPresentationTimeOffset()` for live/DVR support
- `MediaSourceHandler` skips `endOfStream()` for live streams, waiting for manifest refresh instead
- New player API: `player.isLive()`, `player.getDVRWindow()`, `player.seekToLiveEdge()`
- `parseISO8601Duration()` utility for converting ISO 8601 duration strings to seconds

#### Testing
- Vitest test suite with 71 tests across 5 files covering all new features
- `npm test`, `npm run test:watch`, `npm run test:coverage` scripts added

### Fixed
- `QuotaExceededError` on rendition switch: video SourceBuffer is now reused across renditions instead of creating a new one per rendition (browsers cap at 2 SourceBuffers per MediaSource)
- `InvalidStateError` on seek: added final `updating` guard before `appendBuffer` to handle the race where `processRemoveQueue` starts a new `remove` between `updateend` resolving and the `appendBuffer` call
- `InvalidStateError` on rendition switch: `setRendition` now waits for the SourceBuffer to be idle before calling `sb.remove()`, with a second guard after the remove completes
- Rendition switch corrupting playback: added `isSwitchingRendition` flag to block `appendNextSegment` from appending media segments before the init segment of the new rendition is written
- ABR `bufferAhead` snapshot moved to before `appendBuffer` (was reading stale `buffered` state while `updating=true`)
- ABR immediately overriding manual rendition selection: `player.setRendition()` now disables ABR; re-enable with `player.setAdaptiveBitrate(true)`
- `TimelineModel` constructor now copies the input array to prevent `destroy()` from mutating the caller's array via `segments.length = 0`

### Changed
- `MPDParser.parse()` return type extended to include `textTracks`, `isLive`, `minimumUpdatePeriod`, `availabilityStartTime`, `timeShiftBufferDepth`
- `SegmentDownloadResult` extended with optional `downloadBandwidth` field
- `SegmentTemplateInfo` extended with optional `trackType`, `language`, `role` fields
- `player.setAdaptiveBitrate()` is now functional (was a no-op stub)
- Demo page rendition label updates every second; shows `Auto — <resolution>` or `Manual — <resolution>`

## [1.0.3] - 2024-05-25

### Added
- Audio track support with proper initialization
- Configurable segment retry mechanism
- Detailed error logging for segment operations

### Changed
- Refactored MPDParser to use single parse method
- Improved initialization sequence (audio first, then video)
- Enhanced segment retry mechanism with configurable limits

### Fixed
- Duplicate manifest fetching issue
- Infinite retry loop for failed segment fetches
- Initialization sequence for audio and video tracks

### Technical Details
- Implemented segment retry mechanism (MAX_RETRIES = 3)
- Added 1-second delay between retry attempts
- Enhanced error handling for:
  - Fetch errors
  - Empty segment data
  - Buffer append errors
- Improved logging with retry attempt counting
- Added proper cleanup of event listeners
- Enhanced error recovery for continuous playback 

## [Unreleased]

### Added
- Robust seeking and buffer management: seeking now removes old buffered data, updates segment indices, and triggers immediate re-buffering.
- Per-SourceBuffer remove queue: ensures only one remove operation is processed at a time, preventing InvalidStateError during rapid seeks.
- Adaptive segment fetching: segments are only fetched when buffer ahead is low, and continuous playback is maintained after seeks.

### Fixed
- Clamped segment indices after seek to valid range, preventing out-of-range segment fetches and repeated fetch errors.
- Eliminated InvalidStateError on SourceBuffer.remove by queuing removes and processing them sequentially.
- Playback stalls and fetch errors after rapid seeking are now resolved.

### Removed
- Removed `src/core/AdManager.ts` as part of codebase cleanup

### Added
- Added `SegmentFetchError` class for better error handling in segment fetching
- Added `MPDParseError` class for manifest parsing error handling
- Added `SegmentURLGeneratorError` class for URL generation error handling
- Added `TimelineModelError` class for timeline management error handling
- Added `EventBusError` class for event handling error management
- Added `PlayerError` class for player-specific error handling
- Added `LoggerError` class for logging system error handling

### Changed
- Enhanced `SegmentFetcher` with:
  - Request timeout handling
  - Request cancellation support
  - Concurrent request limiting
  - Request caching
  - Exponential backoff with jitter for retries
  - Improved error handling

- Improved `MediaSourceHandler` with:
  - Buffer size management
  - Proper error handling for segment fetching
  - Enhanced cleanup in destroy method
  - Buffer size limits to prevent memory issues

- Enhanced `MPDParser` with:
  - Request timeout protection
  - Maximum manifest size limit
  - XML parsing error handling
  - Required element validation
  - Improved error messages

- Improved `SegmentURLGenerator` with:
  - Template validation
  - Safety checks for segment indices
  - Time value validation
  - URL construction safety
  - Error handling for URL generation

- Enhanced `TimelineModel` with:
  - Segment count limits
  - Duration validation
  - Lifecycle management
  - Improved segment handling
  - Error propagation

- Improved `EventBus` with:
  - Listener limits
  - Event name validation
  - Handler validation
  - Lifecycle management
  - Multiple argument support
  - One-time listener support
  - Error handling for event execution

- Improved `Logger` with:
  - Log level validation
  - Message validation
  - Log entry limits
  - Error handling for logging
  - Improved error messages

- Improved `Player` with:
  - Video element validation
  - State management
  - Retry mechanism for segment loading
  - Error handling for manifest loading
  - Lifecycle management
  - Resource cleanup

### Fixed
- Fixed memory leaks in event handling
- Fixed infinite loops in segment URL generation
- Fixed invalid URL construction
- Fixed missing error handling in various components
- Fixed resource cleanup issues
- Fixed state management problems
- Fixed validation issues in multiple components

### Security
- Added input validation across all components
- Added size limits to prevent memory issues
- Added timeout protection for network requests
- Added proper error handling to prevent crashes
- Added lifecycle management to prevent memory leaks

### Added
- Robust seeking and buffer management: seeking now removes old buffered data, updates segment indices, and triggers immediate re-buffering.
- Per-SourceBuffer remove queue: ensures only one remove operation is processed at a time, preventing InvalidStateError during rapid seeks.
- Adaptive segment fetching: segments are only fetched when buffer ahead is low, and continuous playback is maintained after seeks.

### Fixed
- Clamped segment indices after seek to valid range, preventing out-of-range segment fetches and repeated fetch errors.
- Eliminated InvalidStateError on SourceBuffer.remove by queuing removes and processing them sequentially.
- Playback stalls and fetch errors after rapid seeking are now resolved. 