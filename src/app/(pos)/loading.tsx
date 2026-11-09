import { Skeleton } from "@/components/ui/skeleton";

// Prefetched with every nav link, so a click swaps the page at once while its data streams in.
export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 rounded-lg border border-ink" />
      <Skeleton className="h-96 rounded-lg border border-ink" />
    </div>
  );
}
