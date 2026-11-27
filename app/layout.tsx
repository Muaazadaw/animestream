import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import AppearanceClient from "@/components/AppearanceClient";
import PwaClient from "@/components/PwaClient";
import Header from "@/components/Header";
import SettingsModal from "@/components/SettingsModal";
import SyncClient from "@/components/SyncClient";
import { APPEARANCE_SCRIPT } from "@/lib/appearance";
import { UPDATED, UPDATES, VERSION } from "@/lib/version";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mayoi", template: "%s · Mayoi" },
  description: "Mayoi — discover, track and watch anime.",
  applicationName: "Mayoi",
  // iPhone "Add to Home Screen": opens full screen with its own name and icon (app/apple-icon.png).
  appleWebApp: { capable: true, title: "Mayoi", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#09090d",
  // Use the whole screen on phones with a notch / rounded corners; the layout pads itself (safe-area insets).
  viewportFit: "cover",
};

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
        <PwaClient />
        <SettingsModal />
        <Header />
        <main>{children}</main>
        <footer className="footer">
          <p>
            Mayoi · Anime data from <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>.
            This site does not host any files on its servers unless configured by the site owner.
          </p>
          <p className="footer__ver" title={`Last updated ${UPDATED}`}>
            <span>v{VERSION}</span> · {UPDATES.toLocaleString()} updates
          </p>
        </footer>
      </body>
    </html>
  );
}
