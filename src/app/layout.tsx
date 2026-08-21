import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";

const display = Bricolage_Grotesque({
  weight: ["800"],
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const sans = Instrument_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-instrument",
});
const mono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "Meal Planner",
  description: "The Leber household meal planner.",
};

// Set the theme class before paint to avoid a flash. Default is light; only an
// explicit stored choice of "dark" turns it on.
const noFlash = `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
