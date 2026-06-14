import { cn } from "@/lib/utils";

interface InlineErrorProps {
  message: string | null | undefined;
  className?: string;
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <p
      role="alert"
      aria-live="assertive"
      className={cn(
        "text-sm text-red-400",
        message && "rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3",
        className,
      )}
    >
      {message ?? ""}
    </p>
  );
}
