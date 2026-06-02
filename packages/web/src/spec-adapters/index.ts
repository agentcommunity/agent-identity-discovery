import { v1Adapter } from './v1';
import type { SpecAdapter } from './types';

// The current UI adapter normalizes the stable app-facing shape used by aid1 and aid2 records.
export const selectAdapter = (_version?: string): SpecAdapter => v1Adapter;

export * from './types';
