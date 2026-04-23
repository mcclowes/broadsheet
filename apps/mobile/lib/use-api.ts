import { useAuth } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { createApi } from "./api";

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(
    () => createApi(() => getToken({ template: undefined }) ?? null),
    [getToken],
  );
}
