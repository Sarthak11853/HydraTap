/** Web preview: there is no native closed-app tap logger. */
import type { BridgeState, PendingTap } from './tapBridge';

export type { BridgeState, PendingTap } from './tapBridge';
export const writeBridgeState = async (_s: BridgeState) => {};
export const importPendingTaps = async (_insert: (t: PendingTap) => Promise<void>) => 0;
