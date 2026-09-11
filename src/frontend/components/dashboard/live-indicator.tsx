export function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-foreground" />
      </span>
      Live
    </span>
  );
}
