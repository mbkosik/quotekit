import * as React from "react";
import { cn } from "@/lib/utils";

interface AppTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

const AppTextarea = React.forwardRef<HTMLTextAreaElement, AppTextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40",
        className,
      )}
      {...props}
    />
  );
});
AppTextarea.displayName = "AppTextarea";

export { AppTextarea };
