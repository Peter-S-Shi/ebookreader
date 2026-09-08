// PRODUCT_SPEC.md SS8.1: "Reaching the final page completes the current
// read." Pure helper deciding whether a fresh navigation event actually
// crosses into completion, so callers don't re-trigger the completion
// prompt on every subsequent relocate/scroll tick once already at 100%.

const COMPLETION_THRESHOLD = 0.999; // float-safe stand-in for "reached the end"

export function justReachedCompletion(previousFraction: number, newFraction: number): boolean {
  return previousFraction < COMPLETION_THRESHOLD && newFraction >= COMPLETION_THRESHOLD;
}
