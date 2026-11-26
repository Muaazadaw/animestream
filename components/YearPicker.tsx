"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Menu";

export default function YearPicker({ year, season, max }: { year: number; season: string; max: number }) {
  const router = useRouter();
  const years = Array.from({ length: max - 1969 }, (_, i) => max - i);
  return (
    <label className="year-picker">
      <Icon name="calendar" size={15} />
      <select
        value={year}
        onChange={(e) => router.push(`/trending?season=${season.toLowerCase()}&year=${e.target.value}`)}
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
