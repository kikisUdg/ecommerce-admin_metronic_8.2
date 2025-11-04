import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private USER_KEY = 'user';
  private TOKEN_KEY = 'token';
  private EXP_MS_KEY = 'token_exp_ms';

  // Guarda usuario
  setUser(user: any): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  // Devuelve usuario actual
  getUser<T = any>(): T | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  // Guarda token y su fecha de expiración
  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    const expMs = this.extractExpMs(token);
    if (expMs) localStorage.setItem(this.EXP_MS_KEY, String(expMs));
  }

  // Devuelve el token actual
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  // Verifica si el token ha expirado
  isExpired(skewSeconds = 30): boolean {
    const expStr = localStorage.getItem(this.EXP_MS_KEY);
    if (!expStr) return false;
    const expMs = Number(expStr);
    const now = Date.now() + skewSeconds * 1000;
    return now >= expMs;
  }

  // Extrae el campo "exp" del JWT
  private extractExpMs(token: string): number | null {
    try {
      const [, payloadB64] = token.split('.');
      if (!payloadB64) return null;
      const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(b64));
      return json?.exp ? Number(json.exp) * 1000 : null;
    } catch {
      return null;
    }
  }

  // Limpia todo lo almacenado
  clear(): void {
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EXP_MS_KEY);
  }
}