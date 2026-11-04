import type { IntakeSource } from '../domain/types';
import type { IconName } from './Icon';

export const sourceIcon: Record<IntakeSource, IconName> = { nfc: 'nfc', shortcut: 'shortcut', manual: 'glass' };
export const sourceLabel: Record<IntakeSource, string> = {
  nfc: 'Sticker tap',
  shortcut: 'Shortcut tap',
  manual: 'Added manually',
};
