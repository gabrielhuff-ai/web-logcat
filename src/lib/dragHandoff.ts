// In-app drag-handoff bookkeeping for Files-widget drag sources.
//
// Dragging a file row out of the Files widget defaults to a Pull
// (download to the user's machine) — see `onRowDragEnd` in
// FilesWidget. But some in-app drop targets (the Shell widget's input,
// the Mirror widget's surface) want to consume the drag *as an
// in-app action* instead — i.e. paste the path into the prompt, or
// open the file on the device. Without an explicit handoff signal,
// both behaviours fire: the consumer accepts the text/plain drop and
// the source still kicks off a Pull on `dragend`.
//
// This module is the single boolean that the consumer sets in its
// `onDrop` and the source reads in its `onDragEnd`. It's deliberately
// global (one drag at a time, browser-enforced) and resets itself
// when read so a subsequent drag starts clean.

let consumed = false;

/** Called by an in-app drop target to claim the drag (skip Pull). */
export function markInternalDropConsumed(): void {
  consumed = true;
}

/** Returns true and clears the flag if a consumer claimed the drag. */
export function takeInternalDropConsumed(): boolean {
  const v = consumed;
  consumed = false;
  return v;
}

/** Called at drag start to discard any stale flag from a prior drag. */
export function resetInternalDropConsumed(): void {
  consumed = false;
}
