import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "./_core/hooks/useAuth";
import AuthPage from "./pages/AuthPage";
import Home from "./pages/Home";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";

function AppRouter() {
  const auth = useAuth();
  const setup = trpc.auth.status.useQuery(undefined, { retry: false });
  const [location, navigate] = useLocation();
  const authInfrastructureError = Boolean(
    auth.error && auth.error.data?.code !== "UNAUTHORIZED"
  );
  const verificationError =
    authInfrastructureError || (setup.isError && !auth.user);

  useEffect(() => {
    if (auth.loading || setup.isLoading || verificationError) return;
    if (!auth.user && location !== "/login")
      navigate("/login", { replace: true });
    else if (auth.user && location === "/login")
      navigate("/", { replace: true });
  }, [
    auth.loading,
    auth.user,
    location,
    navigate,
    setup.isLoading,
    verificationError,
  ]);

  if (auth.loading || setup.isLoading) {
    return (
      <div className="app-loading">
        <LoaderCircle className="animate-spin" size={22} />
        <span>Carregando ambiente seguro…</span>
      </div>
    );
  }

  if (verificationError) {
    return (
      <main className="auth-service-error" role="alert">
        <span className="eyebrow">ACESSO SEGURO</span>
        <h1>Não foi possível verificar sua sessão</h1>
        <p>
          O serviço não respondeu. Seus registros não foram apagados; verifique
          a conexão e tente novamente.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void Promise.all([auth.refresh(), setup.refetch()])}
        >
          <LoaderCircle size={16} /> Tentar novamente
        </Button>
      </main>
    );
  }

  if (!auth.user)
    return <AuthPage setupRequired={setup.data?.setupRequired ?? false} />;
  return <Home user={auth.user} onLogout={auth.logout} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" />
          <AppRouter />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
