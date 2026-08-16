import { useLocation } from "wouter";
import { Link } from "wouter";

export default function NotFound() {
  const [location] = useLocation();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 animate-in fade-in duration-500">
      <div className="w-full max-w-lg border border-black text-center p-12">
        <h1 className="num-tab text-black font-bold leading-none mb-6" style={{ fontSize: 'clamp(4rem, 8vw, 6rem)' }}>
          404
        </h1>
        <span className="label-caps block mb-8">
          Path unresolvable: {location}
        </span>
        
        <Link 
          href="/" 
          className="inline-block bg-black text-white px-8 py-4 text-[11px] uppercase font-semibold border border-black hover:bg-white hover:text-black transition-colors"
          style={{ letterSpacing: '0.2em' }}
        >
          Return to Ledger
        </Link>
      </div>
    </div>
  );
}
