import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[23px] text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-white/33 bg-white/5 text-primary-foreground hover:bg-white/10",
        destructive: "border border-white/33 bg-white/5 text-destructive-foreground hover:bg-white/10",
        outline: "border border-white/33 bg-white/5 hover:bg-white/10 hover:text-accent-foreground",
        secondary: "border border-white/33 bg-white/5 text-secondary-foreground hover:bg-white/10",
        ghost: "border border-white/33 bg-white/5 hover:bg-white/10 hover:text-accent-foreground",
        link: "border border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-5 py-4 rounded-[23px]",
        sm: "h-10 rounded-[23px] px-4 py-3",
        lg: "h-14 rounded-[23px] px-10 py-5",
        icon: "h-10 w-10 rounded-[23px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // Apply glassmorphism style to all variants except link (which is just text)
    const shouldApplyGlassmorphism = variant !== "link";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={
          shouldApplyGlassmorphism
            ? {
                backgroundColor: "rgba(255, 255, 255, 0.05)", // Use backgroundColor so it doesn't override background-image
                backgroundBlendMode: "plus-lighter",
                boxShadow:
                  "-11.15px -10.392px 48px -12px rgba(0, 0, 0, 0.15), -1.858px -1.732px 12px -8px rgba(0, 0, 0, 0.15), 1.858px 1.732px 8px 0 rgba(255, 255, 255, 0.12) inset, 0.929px 0.866px 4px 0 rgba(255, 255, 255, 0.12) inset",
                backdropFilter: "blur(2px)",
                color: "#DCDAEE", // Visible text color - gradient will be applied via CSS
              }
            : undefined
        }
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
