import AuthenticationCard from "@/components/authentication-card"

export default function Home() {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Fractal%20Glass%20-%204.jpg-m0AGFq8cSUKl8bpkwATMUJsUJokLwH.jpeg')",
        }}
      />

      {/* Subtle overlay for better contrast */}
      <div className="absolute inset-0 bg-black/20" />

      <div className="flex-1 flex items-center justify-center">
        <AuthenticationCard />
      </div>

      <footer className="relative z-10 mb-6">
        <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl px-6 py-3">
          <p className="text-sm text-white/80 text-center">
            Designed and Developed with <span className="text-white/90">❤️</span> by{" "}
            <a
              href="https://www.youtube.com/@diecastbydollar"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/90 hover:text-white transition-colors duration-200 font-medium"
            >
              Dollar Gill
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
