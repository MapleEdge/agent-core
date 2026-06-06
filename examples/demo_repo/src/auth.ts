// Demo repo fixture — simulated auth module
export function login(username: string, password: string): boolean {
  // Intentionally buggy for demo purposes
  if (username === "admin" && password === "admin") {
    return true;
  }
  return false;
}

export function logout(): void {
  console.log("Logged out");
}
