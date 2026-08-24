import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#09090b] text-white px-4 select-none font-sans">
      <div className="flex flex-col items-center text-center max-w-sm space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-2xl">
          <span className="text-2xl font-black bg-gradient-to-br from-indigo-400 to-purple-500 bg-clip-text text-transparent">
            404
          </span>
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Page Not Found
          </h1>
          <p className="text-xs text-zinc-400 font-normal leading-relaxed">
            The page or asset you are looking for doesn't exist or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 text-xs font-semibold shadow-lg"
        >
          Return to Connect
        </Link>
      </div>
    </div>
  );
}
