import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[23px] border border-white/33 bg-white/5 px-4 py-5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)', // Use backgroundColor so it doesn't override background-image
        backgroundBlendMode: 'plus-lighter',
        boxShadow: '-11.15px -10.392px 48px -12px rgba(0, 0, 0, 0.15), -1.858px -1.732px 12px -8px rgba(0, 0, 0, 0.15), 1.858px 1.732px 8px 0 rgba(255, 255, 255, 0.12) inset, 0.929px 0.866px 4px 0 rgba(255, 255, 255, 0.12) inset',
        backdropFilter: 'blur(2px)',
        color: '#DCDAEE', // Visible text color - gradient will be applied via CSS
      }}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
