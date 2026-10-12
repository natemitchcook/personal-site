// @steered SNARE-2 2026-09-26

import "./globals.css";

export const metadata = {
  title: "Ruffi Points",
  description: "Find the smartest way to book award travel with the points you already have.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="site-body">{children}</body>
    </html>
  );
}
