import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import AppearanceClient from "@/components/AppearanceClient";
import Header from "@/components/Header";
import SettingsModal from "@/components/SettingsModal";
import SyncClient from "@/components/SyncClient";
import { APPEARANCE_SCRIPT } from "@/lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mayoi", template: "%s · Mayoi" },
  description: "Mayoi — discover, track and watch anime.",
};

export const viewport: Viewport = { themeColor: "#09090d" };

// Subtitle font (the usual fansub face); only exposed as a CSS variable.
const captionFont = Roboto({ subsets: ["latin"], weight: ["700"], variable: "--font-caption", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme/accent before the first paint, so it doesn't flash. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className={captionFont.variable}>
        <SyncClient />
        <AppearanceClient />
        <SettingsModal />
        <Header />
        <main>{children}</main>
        <footer className="footer">
          <p>
            Mayoi · Anime data from <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>.
            This site does not host any files on its servers unless configured by the site owner.
          </p>
        </footer>
      </body>
    </html>
  );
}
