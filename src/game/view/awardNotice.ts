// The notice of an award just earned (0x31dc4, update 0x31b48): the award's `EARN` text in the
// middle of the screen. It comes in a fifth of a second, shrinking from one and a half times
// its size, stays four seconds or until touched, and goes in a fifth, shrinking to a half.

export type NoticeState = { phase: 'coming' | 'shown' | 'going'; clock: number };

export const noticeStart = (): NoticeState => ({ phase: 'coming', clock: 0 });

/** One step of the notice's clock. Null once it has gone. */
export function noticeStep(state: NoticeState, dt: number, touched: boolean): NoticeState | null {
  if (state.phase === 'coming') {
    const clock = state.clock + 5 * dt;
    return clock >= 1 ? { phase: 'shown', clock: 4 } : { phase: 'coming', clock };
  }
  if (state.phase === 'shown') {
    const clock = state.clock - dt;
    return clock < 0 || touched ? { phase: 'going', clock: 1 } : { phase: 'shown', clock };
  }
  const clock = state.clock - 5 * dt;
  return clock > 0 ? { phase: 'going', clock } : null;
}

/** How large and how solid the notice is drawn. */
export function noticePose(state: NoticeState): { scale: number; alpha: number } {
  if (state.phase === 'coming') return { scale: 1.5 - 0.5 * state.clock, alpha: state.clock };
  if (state.phase === 'going') return { scale: 0.5 + 0.5 * state.clock, alpha: state.clock };
  return { scale: 1, alpha: 1 };
}
