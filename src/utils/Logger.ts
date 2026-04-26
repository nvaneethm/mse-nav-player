export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export class LoggerError extends Error {
    constructor(
        message: string,
        public readonly level?: LogLevel,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'LoggerError';
    }
}

export class Logger {
    private static instance: Logger;
    private readonly MAX_MESSAGE_LENGTH = 10000; // Prevent memory issues
    private readonly MAX_LOG_ENTRIES = 1000; // Prevent memory issues
    private readonly logEntries: Array<{ level: LogLevel; message: string; timestamp: number }> = [];
    private currentLevel: LogLevel = LogLevel.INFO;
    private isDestroyed: boolean = false;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.logEntries.length = 0;
        this.currentLevel = LogLevel.INFO;
    }

    public setLevel(level: LogLevel): void {
        if (this.isDestroyed) {
            throw new LoggerError('Logger is destroyed');
        }

        if (!Object.values(LogLevel).includes(level)) {
            throw new LoggerError(`Invalid log level: ${level}`);
        }

        this.currentLevel = level;
    }

    public getLevel(): LogLevel {
        if (this.isDestroyed) {
            throw new LoggerError('Logger is destroyed');
        }
        return this.currentLevel;
    }

    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    public error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args);
    }

    public getLogEntries(): Array<{ level: LogLevel; message: string; timestamp: number }> {
        if (this.isDestroyed) {
            throw new LoggerError('Logger is destroyed');
        }
        return [...this.logEntries];
    }

    public clearLogs(): void {
        if (this.isDestroyed) {
            return;
        }
        this.logEntries.length = 0;
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (this.isDestroyed) {
            return;
        }

        if (!this.shouldLog(level)) {
            return;
        }

        try {
            const formattedMessage = this.formatMessage(message, ...args);
            const timestamp = Date.now();

            this.addLogEntry(level, formattedMessage, timestamp);
            this.outputToConsole(level, formattedMessage);
        } catch (err) {
            // Don't throw here to prevent infinite logging loops
            console.error('[Logger] Failed to log message:', err);
        }
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = Object.values(LogLevel);
        const currentLevelIndex = levels.indexOf(this.currentLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }

    private formatMessage(message: string, ...args: any[]): string {
        if (typeof message !== 'string') {
            throw new LoggerError('Message must be a string');
        }

        if (message.length > this.MAX_MESSAGE_LENGTH) {
            throw new LoggerError(
                `Message too long: ${message.length} (max: ${this.MAX_MESSAGE_LENGTH})`
            );
        }

        try {
            let formatted = message;
            args.forEach((arg, index) => {
                const placeholder = `{${index}}`;
                if (formatted.includes(placeholder)) {
                    formatted = formatted.replace(
                        placeholder,
                        this.safeStringify(arg)
                    );
                } else {
                    formatted += ' ' + this.safeStringify(arg);
                }
            });
            return formatted;
        } catch (err) {
            throw new LoggerError('Failed to format message', undefined, err);
        }
    }

    private safeStringify(value: any): string {
        try {
            if (value === undefined) return 'undefined';
            if (value === null) return 'null';
            if (typeof value === 'function') return '[Function]';
            if (typeof value === 'symbol') return value.toString();
            if (typeof value === 'object') {
                if (value instanceof Error) {
                    return `${value.name}: ${value.message}`;
                }
                return JSON.stringify(value, (key, val) => {
                    if (typeof val === 'function') return '[Function]';
                    if (typeof val === 'symbol') return val.toString();
                    return val;
                });
            }
            return String(value);
        } catch (err) {
            return '[Circular]';
        }
    }

    private addLogEntry(level: LogLevel, message: string, timestamp: number): void {
        this.logEntries.push({ level, message, timestamp });
        if (this.logEntries.length > this.MAX_LOG_ENTRIES) {
            this.logEntries.shift(); // Remove oldest entry
        }
    }

    private outputToConsole(level: LogLevel, message: string): void {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}]`;

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(prefix, message);
                break;
            case LogLevel.INFO:
                console.info(prefix, message);
                break;
            case LogLevel.WARN:
                console.warn(prefix, message);
                break;
            case LogLevel.ERROR:
                console.error(prefix, message);
                break;
        }
    }
}

export const logger = Logger.getInstance();