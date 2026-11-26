import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import Header from "@/components/Header";
import SyncClient from "@/components/SyncClient";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AnimeStream", template: "%s · AnimeStream" },
  description: "Discover, track and watch anime.",
};

export const viewport: Viewport = { themeColor: "#0b0b10" };

// Subtitle font (the usual fansub face); only exposed as a CSS variable.
const captionFont = Roboto({ subsets: ["latin"], weight: ["700"], variable: "--font-caption", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={captionFont.variable}>
        <SyncClient />
        <Header />
        <main>{children}</main>
        <footer className="footer">
          <p>
            AnimeStream · Anime data from <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>.
            This site does not host any files on its servers unless configured by the site owner.
          </p>
        </footer>
      </body>
    </html>
  );
}
