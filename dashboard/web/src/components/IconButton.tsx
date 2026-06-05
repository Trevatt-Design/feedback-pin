/**
 * Project-layer IconButton wrapper.
 *
 * Wraps the vendored SDS IconButton so EVERY icon-only button in the
 * dashboard emits BOTH `aria-label` and `title` on its underlying
 * <button>. This is load-bearing for the universal-rules invariant
 * `icon-only-buttons-have-title-attribute`: aria-label feeds screen
 * readers, title is the visible mouseover tooltip.
 *
 * If only `aria-label` is provided, `title` defaults to the same string.
 * Pass an explicit `title` if a shorter tooltip reads better.
 *
 * All future dashboard icon-only buttons MUST go through this wrapper,
 * not the vendored SDS IconButton directly. The current dashboard
 * surface has no icon-only buttons yet, so this wrapper is unused at
 * runtime — it exists so the contract is in place when the surface
 * grows. (No automated ESLint enforcement is wired up; the rule is a
 * convention reviewers check by hand.)
 */
import {
  IconButton as SdsIconButton,
  type IconButtonProps as SdsIconButtonProps,
} from "primitives";
import { type ReactElement } from "react";

export type IconButtonProps = SdsIconButtonProps & {
  "aria-label": string;
  title?: string;
};

export function IconButton({
  title,
  "aria-label": ariaLabel,
  ...rest
}: IconButtonProps): ReactElement {
  // The vendored SDS IconButton forwards arbitrary props to the underlying
  // Button (which renders a RAC <button>). RAC's Button ButtonProps type
  // doesn't list `title` explicitly even though the rendered button accepts
  // it natively, so we cast the merged prop bag once at the boundary.
  const props = {
    ...rest,
    "aria-label": ariaLabel,
    title: title ?? ariaLabel,
  } as SdsIconButtonProps;
  return <SdsIconButton {...props} />;
}
