# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses npm versioning (`npm version patch`).

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