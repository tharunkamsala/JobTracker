import { notFound } from "next/navigation";
import JobTrackerApp from "@/components/JobTrackerApp";
import { getTrackBySlug } from "@/lib/trackPages";

export function generateMetadata({ params }) {
  const track = getTrackBySlug(params.track);
  return {
    title: track ? `${track.title} — Job Tracker` : "Job Tracker",
    description: track
      ? `Track ${track.title.toLowerCase()} applications. Paste links — they save to this list.`
      : "Track every application",
  };
}

export default function TrackPage({ params }) {
  const track = getTrackBySlug(params.track);
  if (!track) notFound();

  return (
    <JobTrackerApp
      lockedBucket={track.bucket}
      pageTitle={track.title}
      pageSub={`Paste a link — saves to ${track.bucket}`}
    />
  );
}
