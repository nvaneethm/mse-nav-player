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