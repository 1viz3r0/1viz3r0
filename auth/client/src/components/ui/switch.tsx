import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[15px] w-[34px] shrink-0 cursor-pointer items-center rounded-[23px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    style={{
      width: '34px',
      height: '15px',
      flexShrink: 0,
      borderRadius: '23px',
      border: '1px solid rgba(255, 255, 255, 0.40)',
      backgroundColor: 'rgba(255, 255, 255, 0.10)', // Use backgroundColor to avoid conflicts
      backgroundBlendMode: 'plus-lighter',
      boxShadow: '-11.15px -10.392px 48px -12px rgba(0, 0, 0, 0.15), -1.858px -1.732px 12px -8px rgba(0, 0, 0, 0.15), 2.146px 2px 9.24px 0 rgba(255, 255, 255, 0.15) inset, 1.217px 1.134px 4.62px 0 rgba(255, 255, 255, 0.15) inset',
      backdropFilter: 'blur(7.579999923706055px)',
    }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block shrink-0 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[19px] data-[state=unchecked]:translate-x-[2px]",
      )}
      style={{
        width: '11px',
        height: '11px',
        flexShrink: 0,
        backgroundColor: '#D9D9D9',
        filter: 'drop-shadow(0 0 0.66px rgba(126, 55, 160, 1)) drop-shadow(0 0 1.32px rgba(126, 55, 160, 1)) drop-shadow(0 0 4.62px rgba(126, 55, 160, 1)) drop-shadow(0 0 9.24px rgba(126, 55, 160, 1)) drop-shadow(0 0 15.84px rgba(126, 55, 160, 1)) drop-shadow(0 0 27.72px rgba(126, 55, 160, 1))',
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
