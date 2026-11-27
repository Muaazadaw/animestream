import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Reader from "@/components/Reader";
import { getManga, titleOf } from "@/lib/anilist";
import { CHAPTER_ID as MANGAKATANA_ID } from "@/lib/manga/mangakatana";

type Props = { params: Promise<{ id: string; chapterId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await getManga(Number((await params).id));
  return m ? { title: `Read ${titleOf(m.title)}` } : {};
}

export default async function ReadPage({ params }: Props) {
  const { id, chapterId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(chapterId) && !MANGAKATANA_ID.test(chapterId)) notFound();
  const m = await getManga(Number(id));
  if (!m) notFound();
  return (
    <Reader
      chapterId={chapterId}
      manga={{ id: m.id, title: titleOf(m.title), cover: m.coverImage.large, format: m.format, type: "MANGA", chapters: m.chapters ?? null }}
    />
  );
}
