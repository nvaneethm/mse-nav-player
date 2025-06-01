import { TimelineSegment } from '../types/timeline.js';

type EventCallback = (data?: any) => void;

export class PlayerEvents {
    private listeners: Map<string, EventCallback[]> = new Map();

    public on(event: string, callback: EventCallback): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    public off(event: string, callback: EventCallback): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    public emit(event: string, data?: any): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    // Ad-specific event types
    public onAdStart(callback: (data: { adId: string; segment: TimelineSegment }) => void): void {
        this.on('ad-start', callback);
    }

    public onAdEnd(callback: (data: { adId: string }) => void): void {
        this.on('ad-end', callback);
    }

    public onAdError(callback: (data: { adId: string; error: unknown }) => void): void {
        this.on('ad-error', callback);
    }

    public onAdSkipped(callback: (data: { adId: string }) => void): void {
        this.on('ad-skipped', callback);
    }
}