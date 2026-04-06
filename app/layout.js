import "./globals.css";

export const metadata = {
  title: "Job Tracker — Track Every Application",
  description: "Paste a job link, auto-extract details, track your entire job search.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
