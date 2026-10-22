import Link from 'next/link';

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="mx-auto max-w-xl p-8 font-sans">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2">
          <Link href="/en" className="underline">
            AI Leaderboard
          </Link>
        </p>
      </body>
    </html>
  );
}
