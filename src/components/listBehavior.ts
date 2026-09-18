/**
 * FlashList v2 turns `maintainVisibleContentPosition` on by default: it anchors the scroll to
 * whatever row is visible and re-applies that offset on the layout pass after the data changes.
 * That is right for a feed that grows at its edges, and wrong for a list whose rows are
 * *replaced* — searching, filtering or switching tab left you parked in the middle of results
 * you had never scrolled through, and clearing the search put you back there again. An
 * imperative `scrollToOffset(0)` does not survive it, because the anchoring runs afterwards.
 *
 * Spread onto any list whose contents a control above it replaces.
 */
export const MAINTAIN_TOP = { disabled: true } as const;
