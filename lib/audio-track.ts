import Hls from "hls.js";

// Some streams carry many audio languages, with e.g. Hindi listed (or marked default) first.
const CODES: Record<string, string[]> = { ja: ["ja", "jp", "jpn", "japanese"], en: ["en", "eng", "english"] };

/** Plays the stream's audio in `lang` (see Stream.audioLang) once hls.js lists the tracks. */
export function keepAudioLanguage(hls: Hls, lang: string | undefined) {
  if (!lang) return;
  const want = CODES[lang] ?? [lang];
  hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
    const i = hls.audioTracks.findIndex(
      (t) => want.includes((t.lang ?? "").toLowerCase().split("-")[0]) || want.includes((t.name ?? "").toLowerCase()),
    );
    if (i >= 0 && hls.audioTrack !== i) hls.audioTrack = i;
  });
}
