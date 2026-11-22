import { useQueryClient } from "@tanstack/react-query";
import { clearCsrfToken, storeCsrfToken } from "@/const";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect } from "react";

export function useAuth() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const query = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    if (query.data?.csrfToken) storeCsrfToken(query.data.csrfToken);
  }, [query.data?.csrfToken]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    clearCsrfToken();
    queryClient.clear();
    window.location.replace("/login");
  }, [logoutMutation.mutateAsync, queryClient]);

  const refresh = useCallback(() => query.refetch(), [query.refetch]);

  return {
    user: query.data?.user ?? null,
    loading: query.isLoading || logoutMutation.isPending,
    error: query.error ?? null,
    isAuthenticated: Boolean(query.data?.user),
    logout,
    refresh,
  };
}
