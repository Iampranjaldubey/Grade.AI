import { apiClient } from "./api";
import type { LoginCredentials, RegisterPayload, TokenResponse, User } from "@/types";

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>("/auth/login", credentials);
  localStorage.setItem("gradeai_token", data.access_token);
  return data;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await apiClient.post<User>("/auth/register", payload);
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>("/users/me");
  return data;
}

export function logout(): void {
  localStorage.removeItem("gradeai_token");
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem("gradeai_token"));
}
