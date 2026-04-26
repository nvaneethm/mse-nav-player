import { Player } from './core/Player';
import { TimelineModel } from './core/TimelineModel';

(window as any).MseNavPlayer = { 
    Player,
    TimelineModel
};

export { Player } from './core/Player';
export { TimelineModel } from './core/TimelineModel';
export { logger } from './utils/Logger';