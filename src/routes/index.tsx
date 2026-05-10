import { createFileRoute } from "@tanstack/react-router";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/tanstack-react-start";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
	return (
		<div className="flex min-h-screen flex-col bg-black font-mono text-zinc-100">
			{/* Top bar */}
			<header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
				<span className="text-[11px] uppercase tracking-widest text-zinc-600">
					ep / tracker
				</span>
				<SignedIn>
					<UserButton />
				</SignedIn>
				<SignedOut>
					<SignInButton mode="modal">
						<button
							type="button"
							className="border border-zinc-700 px-4 py-1.5 text-[11px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
						>
							sign in
						</button>
					</SignInButton>
				</SignedOut>
			</header>

			{/* Hero */}
			<main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
				<p className="mb-3 text-[10px] uppercase tracking-widest text-zinc-600">
					// coaching
				</p>
				<h1 className="text-4xl font-bold uppercase tracking-widest text-zinc-100 sm:text-5xl">
					Evolving
					<br />
					Physiques
				</h1>
				<p className="mt-6 text-xs uppercase tracking-widest text-zinc-600">
					weekly check-in tracker
				</p>

				<div className="mt-12">
					<SignedOut>
						<SignInButton mode="modal">
							<button
								type="button"
								className="border border-zinc-700 px-8 py-3 text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
							>
								sign in to continue
							</button>
						</SignInButton>
					</SignedOut>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-zinc-900 px-6 py-4">
				<p className="text-center text-[10px] uppercase tracking-widest text-zinc-800">
					@evolving.physiques
				</p>
			</footer>
		</div>
	);
}
