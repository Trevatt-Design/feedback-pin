import React, {
  ComponentPropsWithoutRef,
  ForwardedRef,
  forwardRef,
} from "react";
import {
  Button as RACButton,
  Link as RACLink,
  type ButtonProps as RACButtonProps,
} from "react-aria-components";

export type AnchorOrButtonSharedProps = {
  children?: React.ReactNode;
  href?: string;
};

export type AnchorOrButtonProps = (
  | RACButtonProps
  | ComponentPropsWithoutRef<typeof RACLink>
) &
  AnchorOrButtonSharedProps;

function isAnchorProps(
  props: AnchorOrButtonProps,
): props is AnchorOrButtonSharedProps &
  ComponentPropsWithoutRef<typeof RACLink> {
  return "href" in props;
}

export const AnchorOrButton = forwardRef(function AnchorOrButton(
  props: AnchorOrButtonProps,
  ref: ForwardedRef<HTMLElement>,
) {
  const { style: _style, ...sharedProps } = props;
  return isAnchorProps(props) ? (
    <RACLink
      {...(sharedProps as React.ComponentProps<typeof RACLink>)}
      className={props.className}
      ref={ref as React.ForwardedRef<HTMLAnchorElement>}
    >
      {props.children}
    </RACLink>
  ) : (
    <RACButton
      {...(sharedProps as React.ComponentProps<typeof RACButton>)}
      className={props.className}
      ref={ref as React.ForwardedRef<HTMLButtonElement>}
    >
      {props.children}
    </RACButton>
  );
});
