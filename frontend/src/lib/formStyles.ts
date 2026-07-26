/**
 * One field size for every FIR-header form, so the "Start a new investigation"
 * popup and the case-diary editor (which backs both "Add / Edit Case Diary" and
 * "Next Diary") look identical.
 *
 * Applied on the grid container rather than on each control: eleven fields stay
 * in step automatically, and a field added later inherits the same size.
 * `Select` sizing can't be set this way — its own `data-[size]` rule is more
 * specific — so those triggers take `size="compact"` instead.
 */
export const COMPACT_FIELD_GRID = "gap-x-4 gap-y-2 [&_input]:h-[30px] [&_label]:text-[10px]";

/** Spacing between a field's label and its control, matching the grid above. */
export const COMPACT_FIELD = "space-y-1";
