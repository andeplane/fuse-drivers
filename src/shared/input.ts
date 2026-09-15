/** The one flat input record every controller produces (ADR 002). */
export interface TruckInput {
  left: boolean;
  right: boolean;
  brake: boolean;
  nitro: boolean;
  item: boolean;
  itemAlt: boolean;
}

export const NEUTRAL_INPUT: TruckInput = { left: false, right: false, brake: false, nitro: false, item: false, itemAlt: false };
/** Fed to a silent seat so a locked phone stops instead of racing on (ADR 008). */
export const BRAKE_INPUT: TruckInput = { ...NEUTRAL_INPUT, brake: true };
