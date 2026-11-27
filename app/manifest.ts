import type { MetadataRoute } from "next";

// Makes Mayoi installable as an app ("Install app" on Android, "Add to Home
// Screen" on iPhone): full screen, its own icon, no browser bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Mayoi",
    short_name: "Mayoi",
    description: "Discover, track and watch anime.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#09090d",
    theme_color: "#09090d",
    categories: ["entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Continue watching", url: "/library?view=history", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Search", url: "/search", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Schedule", url: "/schedule", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
