import { SegmentDownloadResult } from "./types";
import { logger } from "../utils/Logger";

export class SegmentFetchError extends Error {
    constructor(
        message: string,
        public readonly url: string,
        public readonly status?: number,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'SegmentFetchError';
    }
}

export class SegmentFetcher {
    private readonly cache: Map<string, SegmentDownloadResult> = new Map();
    private readonly inFlightRequests: Map<string, AbortController> = new Map();
    private readonly MAX_CONCURRENT_REQUESTS = 3;
    private readonly REQUEST_TIMEOUT = 10000; // 10 seconds
    private activeRequests = 0;

    constructor(
        private maxRetries: number = 3,
        private cacheEnabled: boolean = true
    ) {}

    async fetchSegment(url: string): Promise<SegmentDownloadResult> {
        // Check cache first
        if (this.cacheEnabled) {
            const cached = this.cache.get(url);
            if (cached) {
                logger.debug(`[SegmentFetcher] Cache hit for ${url}`);
                return cached;
            }
        }

        // Cancel any existing request for this URL
        this.cancelRequest(url);

        // Wait if we've hit the concurrent request limit
        while (this.activeRequests >= this.MAX_CONCURRENT_REQUESTS) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.activeRequests++;
        const controller = new AbortController();
        this.inFlightRequests.set(url, controller);

        try {
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    const timeoutId = setTimeout(() => {
                        controller.abort();
                    }, this.REQUEST_TIMEOUT);

                    const response = await fetch(url, {
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        throw new SegmentFetchError(
                            `HTTP ${response.status}`,
                            url,
                            response.status
                        );
                    }

                    const buffer = await response.arrayBuffer();
                    const result = { url, data: buffer };

                    // Cache the result
                    if (this.cacheEnabled) {
                        this.cache.set(url, result);
                    }

                    return result;
                } catch (err) {
                    if (err instanceof Error && err.name === 'AbortError') {
                        throw new SegmentFetchError('Request timeout', url, undefined, err);
                    }

                    logger.warn(`[SegmentFetcher] Attempt ${attempt} failed for ${url}`, err);

                    if (attempt === this.maxRetries) {
                        throw new SegmentFetchError(
                            `Failed after ${attempt} attempts`,
                            url,
                            undefined,
                            err
                        );
                    }

                    // Exponential backoff with jitter
                    const delay = 100 * Math.pow(2, attempt) * (0.5 + Math.random());
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            throw new SegmentFetchError('Unknown fetch failure', url);
        } finally {
            this.activeRequests--;
            this.inFlightRequests.delete(url);
        }
    }

    private cancelRequest(url: string): void {
        const controller = this.inFlightRequests.get(url);
        if (controller) {
            controller.abort();
            this.inFlightRequests.delete(url);
        }
    }

    public clearCache(): void {
        this.cache.clear();
    }

    public setCacheEnabled(enabled: boolean): void {
        this.cacheEnabled = enabled;
        if (!enabled) {
            this.clearCache();
        }
    }

    public destroy(): void {
        // Cancel all in-flight requests
        for (const [url, controller] of this.inFlightRequests) {
            controller.abort();
        }
        this.inFlightRequests.clear();
        this.cache.clear();
        this.activeRequests = 0;
    }
}