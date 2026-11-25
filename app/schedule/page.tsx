import type { Metadata } from "next";
import { getSchedule } from "@/lib/anilist";
import ScheduleView from "./ScheduleView";

export const metadata: Metadata = { title: "Schedule" };
export const revalidate = 900;

export default async function SchedulePage() {
  const items = await getSchedule(7);
  return (
    <div className="container page">
      <h1 className="page__title">Airing schedule</h1>
      <ScheduleView items={items} />
    </div>
  );
}
