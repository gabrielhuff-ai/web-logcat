// Mirror widget — settings shape and defaults. No legacy-key migration
// (the widget didn't persist anything pre-modal).

export interface MirrorSettings {
  /** Affects overlay text only (REC pill, simulated-mode notices). */
  fontSize: number;
}

export const MIRROR_DEFAULTS: MirrorSettings = {
  fontSize: 12,
};
