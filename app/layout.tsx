import "./globals.css";
import { Providers } from "@/components/providers";
import { IBM_Plex_Sans } from "next/font/google";

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"]
});

export const metadata = {
  title: "QA Pro Tracker",
  description: "Professional QA management platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${ibmPlex.className} grid-backdrop min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
