export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4
};

const consoleMethod: Record<Exclude<LogLevel, 'none'>, 'log' | 'info' | 'warn' | 'error'> = {
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

class Logger {
  private currentLevel: LogLevel = 'info';

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] >= 0 && levelPriority[level] >= levelPriority[this.currentLevel];
  }

  private log(level: Exclude<LogLevel, 'none'>, ...args: unknown[]) {
    if (!this.shouldLog(level)) return;

    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
    const method = consoleMethod[level];
    console[method](prefix, ...args);
  }

  debug(...args: unknown[]) {
    this.log('debug', ...args);
  }

  info(...args: unknown[]) {
    this.log('info', ...args);
  }

  warn(...args: unknown[]) {
    this.log('warn', ...args);
  }

  error(...args: unknown[]) {
    this.log('error', ...args);
  }
}

export const logger = new Logger();