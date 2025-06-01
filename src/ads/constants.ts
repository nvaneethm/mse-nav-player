/**
 * Event names for ad-related events
 */
export const AD_EVENTS = {
    START: 'ad-start',
    END: 'ad-end',
    ERROR: 'ad-error',
    SKIPPED: 'ad-skipped'
} as const;

/**
 * Default configuration values for ad playback
 */
export const DEFAULT_AD_CONFIG = {
    PRELOAD_ADS: true,
    SKIP_THRESHOLD: 5,
    MAX_AD_DURATION: 30,
    ALLOW_MULTIPLE_ADS: true
} as const;

/**
 * Log messages for ad-related events
 */
export const AD_LOG_MESSAGES = {
    SKIP_MULTIPLE: '[AdManager] Skipping ad - another ad is already playing',
    DURATION_EXCEEDED: '[AdManager] Ad duration exceeds maximum allowed duration',
    AD_STARTED: '[AdManager] Ad started',
    AD_ENDED: '[AdManager] Ad ended',
    AD_SKIPPED: '[AdManager] Ad skipped',
    AD_ERROR: '[AdManager] Ad error occurred',
    MANAGER_DESTROYED: '[AdManager] Operation cancelled - manager has been destroyed',
    INVALID_SEGMENT: '[AdManager] Invalid ad segment provided'
} as const; 