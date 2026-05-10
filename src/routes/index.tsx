import { createFileRoute, Link } from "@tanstack/react-router";
import { SignInButton, Show, UserButton } from "@clerk/tanstack-react-start";
import { getAllowedSpreadsheetIds } from "#/lib/sheets";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return { ids: await getAllowedSpreadsheetIds() };
    } catch (err) {
      console.log("found err:", err);
      return { ids: [] as string[] };
    }
  },
  component: Landing,
});

function Landing() {
  const { ids = [] } = Route.useLoaderData() ?? {};

  return (
    <div className="flex min-h-screen flex-col bg-black font-mono text-zinc-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <span className="text-[11px] uppercase tracking-widest text-zinc-600">
          ep / tracker
        </span>
        <Show when={"signed-in"}>
          <UserButton />
        </Show>
        <Show when={"signed-out"}>
          <SignInButton mode="modal">
            <button
              type="button"
              className="border border-zinc-700 px-4 py-1.5 text-[11px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
            >
              sign in
            </button>
          </SignInButton>
        </Show>
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

        <div className="mt-12 flex flex-col items-center gap-3">
          <Show when={"signed-out"}>
            <SignInButton mode="modal">
              <button
                type="button"
                className="border border-zinc-700 px-8 py-3 text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
              >
                sign in to continue
              </button>
            </SignInButton>
          </Show>

          <Show when={"signed-in"}>
            {console.log(ids)}
            {ids.length === 1 && (
              <Link
                to="/$spreadsheetId"
                params={{ spreadsheetId: ids[0]! }}
                className="border border-zinc-700 px-8 py-3 text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
              >
                continue to tracker →
              </Link>
            )}
            {ids.length > 1 &&
              ids.map((id) => (
                <Link
                  key={id}
                  to="/$spreadsheetId"
                  params={{ spreadsheetId: id }}
                  className="border border-zinc-700 px-8 py-3 text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
                >
                  tracker {id.slice(0, 8)}… →
                </Link>
              ))}
          </Show>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-6 py-4 flex justify-center">
        <a
          href="https://instagram.com/evolving.physiques"
          target="_blank"
          className="text-center text-[10px] uppercase tracking-widest text-zinc-800"
        >
          @evolving.physiques
        </a>
      </footer>
    </div>
  );
}
