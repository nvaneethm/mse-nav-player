import { logger } from '../utils/Logger';

export class EventBusError extends Error {
    constructor(
        message: string,
        public readonly event?: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'EventBusError';
    }
}

type EventHandler = (...args: any[]) => void;

export class EventBus {
    private readonly MAX_LISTENERS = 100; // Prevent memory leaks
    private readonly MAX_EVENT_NAME_LENGTH = 100; // Prevent abuse
    private readonly handlers: Map<string, Set<EventHandler>> = new Map();
    private readonly onceHandlers: Map<string, Set<EventHandler>> = new Map();
    private isDestroyed: boolean = false;

    constructor() {
        logger.debug('[EventBus] Initialized');
    }

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.handlers.clear();
        this.onceHandlers.clear();
        logger.debug('[EventBus] Destroyed');
    }

    public on(event: string, handler: EventHandler): void {
        this.validateEventName(event);
        this.validateHandler(handler);

        if (this.isDestroyed) {
            throw new EventBusError('EventBus is destroyed', event);
        }

        try {
            if (!this.handlers.has(event)) {
                this.handlers.set(event, new Set());
            }

            const handlers = this.handlers.get(event)!;
            if (handlers.size >= this.MAX_LISTENERS) {
                throw new EventBusError(
                    `Too many listeners for event: ${event} (max: ${this.MAX_LISTENERS})`,
                    event
                );
            }

            handlers.add(handler);
            logger.debug(`[EventBus] Added listener for event: ${event}`);
        } catch (err) {
            throw new EventBusError('Failed to add event listener', event, err);
        }
    }

    public once(event: string, handler: EventHandler): void {
        this.validateEventName(event);
        this.validateHandler(handler);

        if (this.isDestroyed) {
            throw new EventBusError('EventBus is destroyed', event);
        }

        try {
            if (!this.onceHandlers.has(event)) {
                this.onceHandlers.set(event, new Set());
            }

            const handlers = this.onceHandlers.get(event)!;
            if (handlers.size >= this.MAX_LISTENERS) {
                throw new EventBusError(
                    `Too many once listeners for event: ${event} (max: ${this.MAX_LISTENERS})`,
                    event
                );
            }

            handlers.add(handler);
            logger.debug(`[EventBus] Added once listener for event: ${event}`);
        } catch (err) {
            throw new EventBusError('Failed to add once event listener', event, err);
        }
    }

    public off(event: string, handler: EventHandler): void {
        this.validateEventName(event);
        this.validateHandler(handler);

        if (this.isDestroyed) {
            return;
        }

        try {
            const handlers = this.handlers.get(event);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    this.handlers.delete(event);
                }
            }

            const onceHandlers = this.onceHandlers.get(event);
            if (onceHandlers) {
                onceHandlers.delete(handler);
                if (onceHandlers.size === 0) {
                    this.onceHandlers.delete(event);
                }
            }

            logger.debug(`[EventBus] Removed listener for event: ${event}`);
        } catch (err) {
            throw new EventBusError('Failed to remove event listener', event, err);
        }
    }

    public emit(event: string, ...args: any[]): void {
        this.validateEventName(event);

        if (this.isDestroyed) {
            return;
        }

        try {
            // Handle regular listeners
            const handlers = this.handlers.get(event);
            if (handlers) {
                for (const handler of handlers) {
                    try {
                        handler(...args);
                    } catch (err) {
                        logger.error(`[EventBus] Error in event handler for ${event}:`, err);
                    }
                }
            }

            // Handle once listeners
            const onceHandlers = this.onceHandlers.get(event);
            if (onceHandlers) {
                for (const handler of onceHandlers) {
                    try {
                        handler(...args);
                    } catch (err) {
                        logger.error(`[EventBus] Error in once event handler for ${event}:`, err);
                    }
                }
                this.onceHandlers.delete(event);
            }

            logger.debug(`[EventBus] Emitted event: ${event}`);
        } catch (err) {
            throw new EventBusError('Failed to emit event', event, err);
        }
    }

    public removeAllListeners(event?: string): void {
        if (this.isDestroyed) {
            return;
        }

        try {
            if (event) {
                this.validateEventName(event);
                this.handlers.delete(event);
                this.onceHandlers.delete(event);
                logger.debug(`[EventBus] Removed all listeners for event: ${event}`);
            } else {
                this.handlers.clear();
                this.onceHandlers.clear();
                logger.debug('[EventBus] Removed all listeners');
            }
        } catch (err) {
            throw new EventBusError('Failed to remove listeners', event, err);
        }
    }

    public listenerCount(event: string): number {
        this.validateEventName(event);

        if (this.isDestroyed) {
            return 0;
        }

        try {
            const handlers = this.handlers.get(event)?.size || 0;
            const onceHandlers = this.onceHandlers.get(event)?.size || 0;
            return handlers + onceHandlers;
        } catch (err) {
            throw new EventBusError('Failed to get listener count', event, err);
        }
    }

    private validateEventName(event: string): void {
        if (typeof event !== 'string') {
            throw new EventBusError('Event name must be a string');
        }

        if (event.length === 0) {
            throw new EventBusError('Event name cannot be empty');
        }

        if (event.length > this.MAX_EVENT_NAME_LENGTH) {
            throw new EventBusError(
                `Event name too long: ${event.length} (max: ${this.MAX_EVENT_NAME_LENGTH})`
            );
        }
    }

    private validateHandler(handler: EventHandler): void {
        if (typeof handler !== 'function') {
            throw new EventBusError('Handler must be a function');
        }
    }
} 