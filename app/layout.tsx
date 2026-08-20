import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Shiftly | シフト管理", description: "希望回収から公開まで、ひとつの場所で。" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
