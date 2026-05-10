import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RedirectToSignIn, useAuth } from "@clerk/tanstack-react-start";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
});

function AuthLayout() {
	const { isSignedIn, isLoaded } = useAuth();

	if (!isLoaded) return null;
	if (!isSignedIn) return <RedirectToSignIn />;

	return <Outlet />;
}
